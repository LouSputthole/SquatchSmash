import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveEvidenceOutputRoot } from './evidence-directory-transaction.mjs';

const SOURCE_ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const BOOTSTRAP_PARENT = path.join(SOURCE_ROOT, '.tmp');
const TOOL_FILES = Object.freeze([
  'tools/run-global-geometry-evidence.mjs',
  'tools/capture-global-geometry-evidence.mjs',
  'tools/global-geometry-evidence-contract.mjs',
  'tools/screenshot-artifact-contract.mjs',
  'tools/evidence-directory-transaction.mjs',
]);

function inside(parent, candidate) {
  const resolvedParent = path.resolve(parent);
  const resolvedCandidate = path.resolve(candidate);
  return resolvedCandidate !== resolvedParent
    && resolvedCandidate.startsWith(`${resolvedParent}${path.sep}`);
}

function copyFile(sourceRoot, destinationRoot, relativeFile) {
  const source = path.resolve(sourceRoot, ...relativeFile.split('/'));
  const destination = path.resolve(destinationRoot, ...relativeFile.split('/'));
  if (!inside(sourceRoot, source) || !inside(destinationRoot, destination)) {
    throw new Error(`Global geometry immutable bootstrap path escaped: ${relativeFile}`);
  }
  const sourceRealRoot = fs.realpathSync(sourceRoot);
  const sourceReal = fs.realpathSync(source);
  if (!sourceReal.startsWith(`${sourceRealRoot}${path.sep}`)) {
    throw new Error(`Global geometry immutable bootstrap symlink escaped: ${relativeFile}`);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

export function materializeGlobalGeometryImmutableBootstrap(
  sourceRoot = SOURCE_ROOT,
  destinationRoot,
  dependencies = {},
) {
  const source = path.resolve(sourceRoot);
  const destination = path.resolve(destinationRoot);
  const allowedParent = path.resolve(source, '.tmp');
  if (!inside(allowedParent, destination)) {
    throw new Error(`Global geometry immutable bootstrap must stay below ${allowedParent}`);
  }
  for (const file of TOOL_FILES) copyFile(source, destination, file);
  const contractFile = path.join(destination, 'tools', 'global-geometry-evidence-contract.mjs');
  const manifestFile = path.join(destination, '.global-geometry-immutable-bootstrap.json');
  if (typeof dependencies.planSnapshot === 'function') {
    const planned = dependencies.planSnapshot(source);
    for (const [file, bytes] of planned.snapshot.immutableSourceBytes) {
      const target = path.resolve(destination, ...file.split('/'));
      if (!inside(destination, target)) {
        throw new Error(`Global geometry closure escaped destination: ${file}`);
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, bytes);
    }
    fs.writeFileSync(manifestFile, JSON.stringify({
      schema: 'squatch-global-geometry-immutable-bootstrap/v1',
      sourceSnapshotSha256: planned.identity.sourceSnapshotSha256,
      materializedFiles: planned.snapshot.immutableSourceBytes.size,
      identity: planned.identity,
    }, null, 2));
  } else {
  const plannerSource = `
    import fs from 'node:fs';
    import path from 'node:path';
    import { pathToFileURL } from 'node:url';
    const sourceRoot = ${JSON.stringify(source)};
    const destination = ${JSON.stringify(destination)};
    const contract = await import(pathToFileURL(${JSON.stringify(contractFile)}).href);
    const snapshot = contract.snapshotGlobalGeometryServedSourceBytes(sourceRoot);
    for (const [file, bytes] of snapshot.immutableSourceBytes) {
      const target = path.resolve(destination, ...file.split('/'));
      if (target === destination || !target.startsWith(destination + path.sep)) {
        throw new Error('Global geometry closure escaped destination: ' + file);
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, bytes);
    }
    const identity = contract.currentGlobalGeometryEvidenceSourceIdentities();
    fs.writeFileSync(${JSON.stringify(manifestFile)}, JSON.stringify({
      schema: 'squatch-global-geometry-immutable-bootstrap/v1',
      sourceSnapshotSha256: identity.sourceSnapshotSha256,
      materializedFiles: snapshot.immutableSourceBytes.size,
      identity,
    }, null, 2));
  `;
  const runPlanner = dependencies.runPlanner ?? ((script) => spawnSync(
    process.execPath, ['--input-type=module', '--eval', script],
    { cwd: destination, encoding: 'utf8', windowsHide: true },
  ));
  const planned = runPlanner(plannerSource);
  if (planned?.status !== 0) {
    throw new Error(`Global geometry immutable bootstrap planner failed: ${
      planned?.stderr || planned?.error || planned?.status}`);
  }
  }
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  if (manifest.schema !== 'squatch-global-geometry-immutable-bootstrap/v1'
      || !/^[a-f0-9]{64}$/.test(manifest.sourceSnapshotSha256 ?? '')
      || !Number.isSafeInteger(manifest.materializedFiles) || manifest.materializedFiles < 1) {
    throw new Error('Global geometry immutable bootstrap planner returned an invalid manifest');
  }
  return Object.freeze({
    root: destination,
    worker: path.join(destination, 'tools', 'capture-global-geometry-evidence.mjs'),
    manifestFile,
    manifest: Object.freeze(manifest),
  });
}

export function runGlobalGeometryImmutableBootstrap(
  args = process.argv.slice(2), env = process.env, dependencies = {},
) {
  const workerArgs = [...args];
  let cliOutput = null;
  for (let index = 0; index < workerArgs.length; index += 1) {
    if (workerArgs[index] === '--out' && workerArgs[index + 1]) {
      cliOutput = resolveEvidenceOutputRoot(workerArgs[index + 1], SOURCE_ROOT);
      workerArgs[index + 1] = cliOutput;
      index += 1;
    } else if (workerArgs[index].startsWith('--out=')) {
      cliOutput = resolveEvidenceOutputRoot(workerArgs[index].slice(6), SOURCE_ROOT);
      workerArgs[index] = `--out=${cliOutput}`;
    }
  }
  const selectedOutput = cliOutput ?? resolveEvidenceOutputRoot(
    env.GLOBAL_GEOMETRY_EVIDENCE_OUT || 'docs/validation/global-geometry', SOURCE_ROOT,
  );
  const makeBootstrapDirectory = dependencies.makeBootstrapDirectory ?? (() => {
    fs.mkdirSync(BOOTSTRAP_PARENT, { recursive: true });
    return fs.mkdtempSync(path.join(BOOTSTRAP_PARENT, 'global-geometry-immutable-'));
  });
  const materializeBootstrap = dependencies.materializeBootstrap
    ?? materializeGlobalGeometryImmutableBootstrap;
  const spawnWorker = dependencies.spawnWorker ?? spawnSync;
  const removeBootstrap = dependencies.removeBootstrap
    ?? ((target) => fs.rmSync(target, { recursive: true, force: true }));
  const destination = makeBootstrapDirectory();
  if (!inside(BOOTSTRAP_PARENT, destination)) {
    throw new Error('Global geometry immutable bootstrap resolved outside its staging parent');
  }
  try {
    const bootstrap = materializeBootstrap(SOURCE_ROOT, destination);
    const worker = spawnWorker(process.execPath, [bootstrap.worker, ...workerArgs], {
      cwd: bootstrap.root,
      env: {
        ...env,
        GLOBAL_GEOMETRY_EVIDENCE_IMMUTABLE_WORKER: '1',
        GLOBAL_GEOMETRY_EVIDENCE_SOURCE_ROOT: bootstrap.root,
        GLOBAL_GEOMETRY_EVIDENCE_EXPECTED_SOURCE_SHA256:
          bootstrap.manifest.sourceSnapshotSha256,
        GLOBAL_GEOMETRY_EVIDENCE_OUT: selectedOutput,
      },
      stdio: 'inherit',
      windowsHide: true,
    });
    if (worker.error) throw worker.error;
    return worker.status ?? 1;
  } finally {
    if (inside(BOOTSTRAP_PARENT, destination)) {
      removeBootstrap(destination);
    }
  }
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    process.exitCode = runGlobalGeometryImmutableBootstrap();
  } catch (error) {
    process.stderr.write(`${error?.stack || error}\n`);
    process.exitCode = 1;
  }
}
