import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SAFE_LABEL = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

function comparablePath(value) {
  const normalized = path.normalize(value);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function assertNoReparsePath(resolvedPath) {
  const absolute = path.resolve(resolvedPath);
  const root = path.parse(absolute).root;
  const relative = path.relative(root, absolute);
  const components = relative ? relative.split(path.sep).filter(Boolean) : [];
  let current = root;
  for (const component of components) {
    current = path.join(current, component);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    if (stat.isSymbolicLink()) {
      throw new Error(`unsafe evidence output root symbolic-link or junction: ${current}`);
    }
    const real = (fs.realpathSync.native ?? fs.realpathSync)(current);
    if (comparablePath(real) !== comparablePath(current)) {
      throw new Error(`unsafe evidence output root reparse point: ${current}`);
    }
  }
}

function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    return error?.code === 'EPERM';
  }
}

function directChild(root, child) {
  const resolvedRoot = path.resolve(root);
  const resolvedChild = path.resolve(child);
  return resolvedChild !== resolvedRoot && path.dirname(resolvedChild) === resolvedRoot;
}

function removeStaleStagingDirectories(outputRoot, label) {
  const prefix = `.${label}-staging-`;
  for (const entry of fs.readdirSync(outputRoot, { withFileTypes: true })) {
    if (!entry.name.startsWith(prefix)) continue;
    const candidate = path.join(outputRoot, entry.name);
    if (!directChild(outputRoot, candidate)) {
      throw new Error(`evidence staging directory escaped output root: ${candidate}`);
    }
    const stat = fs.lstatSync(candidate);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error(`unsafe evidence staging residue: ${candidate}`);
    }
    fs.rmSync(candidate, { recursive: true, force: true });
  }
}

function removeRecoveryMarkers(paths) {
  for (const recoveryPath of paths) {
    try { fs.unlinkSync(recoveryPath); } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
}

function claimMarker(outputRoot, markerPath, payload) {
  const encoded = JSON.stringify(payload);
  const recoveryMarkers = [];
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      fs.writeFileSync(markerPath, encoded, { flag: 'wx' });
      try {
        removeStaleStagingDirectories(outputRoot, payload.label);
        removeRecoveryMarkers(recoveryMarkers);
      } catch (error) {
        try { fs.unlinkSync(markerPath); } catch { /* preserve the cleanup error */ }
        throw error;
      }
      return;
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        removeRecoveryMarkers(recoveryMarkers);
        throw error;
      }
    }

    const markerStat = fs.lstatSync(markerPath);
    if (markerStat.isSymbolicLink() || !markerStat.isFile()) {
      removeRecoveryMarkers(recoveryMarkers);
      throw new Error(`unsafe evidence directory transaction marker: ${markerPath}`);
    }
    let owner = null;
    try { owner = JSON.parse(fs.readFileSync(markerPath, 'utf8')); } catch { /* invalid means stale */ }
    if (processIsAlive(owner?.pid)) {
      removeRecoveryMarkers(recoveryMarkers);
      throw new Error(`evidence directory transaction is already active: ${payload.label} (pid ${owner.pid})`);
    }

    const recoveryPath = path.join(outputRoot,
      `.${payload.label}-directory-transaction-recovery-${randomUUID()}.json`);
    try {
      fs.renameSync(markerPath, recoveryPath);
      recoveryMarkers.push(recoveryPath);
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        removeRecoveryMarkers(recoveryMarkers);
        throw error;
      }
    }
  }
  removeRecoveryMarkers(recoveryMarkers);
  throw new Error(`could not reserve evidence directory transaction: ${payload.label}`);
}

function safeRelativePath(relativePath) {
  const normalized = String(relativePath ?? '').replaceAll('\\', '/');
  const segments = normalized.split('/');
  if (!normalized || path.posix.isAbsolute(normalized) || /^[a-z]:/i.test(normalized)
      || segments.some((segment) => !/^[a-z0-9][a-z0-9._-]*$/i.test(segment))) {
    throw new Error(`unsafe staged evidence path: ${relativePath ?? ''}`);
  }
  return segments.join('/');
}

export function resolveEvidenceOutputRoot(outputRoot, baseDirectory = process.cwd()) {
  if (typeof outputRoot !== 'string' || !outputRoot.trim()) {
    throw new Error('unsafe evidence output root: a nonempty explicit path is required');
  }
  const segments = outputRoot.split(/[\\/]+/);
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error(`unsafe evidence output root traversal: ${outputRoot}`);
  }
  const resolved = path.resolve(baseDirectory, outputRoot);
  const filesystemRoot = path.parse(resolved).root;
  if (comparablePath(resolved) === comparablePath(filesystemRoot)) {
    throw new Error(`unsafe broad filesystem output root: ${outputRoot}`);
  }
  assertNoReparsePath(resolved);
  return resolved;
}

export function beginEvidenceDirectoryTransaction({ outputRoot, label }, dependencies = {}) {
  if (!SAFE_LABEL.test(label ?? '')) throw new Error(`unsafe evidence label: ${label ?? ''}`);
  const resolvedRoot = resolveEvidenceOutputRoot(outputRoot);
  fs.mkdirSync(resolvedRoot, { recursive: true });
  assertNoReparsePath(resolvedRoot);
  const initialRootStat = fs.lstatSync(resolvedRoot, { bigint: true });
  if (!initialRootStat.isDirectory() || initialRootStat.isSymbolicLink()) {
    throw new Error(`unsafe evidence output root directory: ${resolvedRoot}`);
  }
  const assertOutputRootIdentity = () => {
    assertNoReparsePath(resolvedRoot);
    const current = fs.lstatSync(resolvedRoot, { bigint: true });
    if (!current.isDirectory() || current.isSymbolicLink()
        || current.dev !== initialRootStat.dev || current.ino !== initialRootStat.ino) {
      throw new Error(`evidence output root identity changed: ${resolvedRoot}`);
    }
  };
  const finalDirectory = path.join(resolvedRoot, label);

  const token = randomUUID();
  const renameDirectory = dependencies.renameDirectory ?? fs.renameSync;
  const afterRename = dependencies.afterRename ?? (() => {});
  const markerPath = path.join(resolvedRoot, `.${label}-directory-transaction.json`);
  assertOutputRootIdentity();
  claimMarker(resolvedRoot, markerPath, { schema: 1, pid: process.pid, label, token });
  if (fs.existsSync(finalDirectory)) {
    fs.unlinkSync(markerPath);
    throw new Error(`evidence label already committed: ${label}`);
  }
  let stagingDirectory;
  try {
    stagingDirectory = fs.mkdtempSync(path.join(resolvedRoot, `.${label}-staging-${token}-`));
  } catch (error) {
    try { fs.unlinkSync(markerPath); } catch { /* preserve staging failure */ }
    throw error;
  }
  let committed = false;
  let aborted = false;

  const assertMarkerOwnership = () => {
    assertOutputRootIdentity();
    const markerStat = fs.lstatSync(markerPath);
    if (markerStat.isSymbolicLink() || !markerStat.isFile()) {
      throw new Error(`unsafe evidence directory transaction marker: ${markerPath}`);
    }
    let owner;
    try {
      owner = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    } catch (error) {
      throw new Error(`evidence directory transaction marker is unavailable: ${markerPath}`, { cause: error });
    }
    if (owner?.pid !== process.pid || owner?.label !== label || owner?.token !== token) {
      throw new Error(`evidence directory transaction ownership changed: ${markerPath}`);
    }
  };

  const stagePath = (relativePath) => {
    assertOutputRootIdentity();
    const stagingStat = fs.lstatSync(stagingDirectory);
    if (stagingStat.isSymbolicLink() || !stagingStat.isDirectory()) {
      throw new Error(`unsafe evidence staging directory: ${stagingDirectory}`);
    }
    const safe = safeRelativePath(relativePath);
    const target = path.join(stagingDirectory, ...safe.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    return target;
  };

  const commit = ({ ledgerRelativePath = 'evidence.json', ledgerBytes }) => {
    if (committed || aborted) throw new Error('evidence directory transaction is no longer active');
    try {
      assertMarkerOwnership();
      const safeLedger = safeRelativePath(ledgerRelativePath);
      if (ledgerBytes == null) throw new Error('committed evidence ledger bytes are required');
      const expected = Buffer.from(ledgerBytes);
      if (!expected.length) throw new Error('committed evidence ledger bytes cannot be empty');
      const ledgerPath = path.join(stagingDirectory, ...safeLedger.split('/'));
      let ledgerStat;
      try { ledgerStat = fs.lstatSync(ledgerPath); } catch (error) {
        if (error?.code === 'ENOENT') throw new Error(`staged evidence ledger is missing: ${safeLedger}`);
        throw error;
      }
      if (ledgerStat.isSymbolicLink() || !ledgerStat.isFile() || ledgerStat.size <= 0) {
        throw new Error(`staged evidence ledger is not a nonempty regular file: ${safeLedger}`);
      }
      const actual = fs.readFileSync(ledgerPath);
      if (!actual.equals(expected)) {
        throw new Error('staged evidence ledger does not match the committed ledger bytes');
      }
      renameDirectory(stagingDirectory, finalDirectory);
      committed = true;
      afterRename(Object.freeze({ outputRoot: resolvedRoot, label, finalDirectory, markerPath }));
      fs.unlinkSync(markerPath);
      return Object.freeze({
        runDirectory: finalDirectory,
        ledgerFile: path.join(finalDirectory, ...safeLedger.split('/')),
        ledger: Object.freeze({
          relativePath: safeLedger,
          bytes: actual.length,
          sha256: createHash('sha256').update(actual).digest('hex'),
        }),
      });
    } catch (error) {
      if (committed) throw error;
      try {
        abort();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError],
          'Evidence directory commit and owned-state cleanup both failed.');
      }
      throw error;
    }
  };

  const abort = () => {
    if (committed || aborted) return false;
    assertMarkerOwnership();
    fs.rmSync(stagingDirectory, { recursive: true, force: true });
    fs.unlinkSync(markerPath);
    aborted = true;
    return true;
  };

  return Object.freeze({
    outputRoot: resolvedRoot,
    label,
    finalDirectory,
    stagingDirectory,
    markerPath,
    stagePath,
    commit,
    abort,
    get committed() { return committed; },
    get aborted() { return aborted; },
  });
}
