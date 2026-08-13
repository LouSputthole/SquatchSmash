import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, posix, relative, resolve, win32 } from 'node:path';

export const SCENE_AUDIT_SCHEMA = 'squatchsmash.scene-geometry-audit.v4';

export function parseSceneAuditArgs(args = []) {
  const parsed = { asJson: false, outputPath: null, only: [] };
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--json') {
      parsed.asJson = true;
      continue;
    }
    if (argument === '--out') {
      const outputPath = args[++index];
      if (!outputPath || outputPath.startsWith('--')) {
        throw new Error('--out requires an explicit JSON path');
      }
      parsed.outputPath = outputPath;
      continue;
    }
    if (argument.startsWith('--out=')) {
      parsed.outputPath = argument.slice('--out='.length);
      if (!parsed.outputPath) throw new Error('--out requires an explicit JSON path');
      continue;
    }
    if (argument.startsWith('--')) throw new Error(`unknown scene-audit option: ${argument}`);
    parsed.only.push(argument);
  }
  return parsed;
}

export function resolveSceneAuditSelection(scenes = [], only = []) {
  if (!only.length) return [...scenes];
  const known = new Set(scenes.map(({ id }) => id));
  const unknown = [...new Set(only.filter((id) => !known.has(id)))];
  if (unknown.length) {
    throw new Error(`unknown scene audit id(s): ${unknown.join(', ')}`);
  }
  const wanted = new Set(only);
  return scenes.filter(({ id }) => wanted.has(id));
}

const sha256 = (source) => createHash('sha256')
  .update(Buffer.isBuffer(source) ? source : String(source))
  .digest('hex');

/** Reduce one served response to compact, raw-byte provenance immediately. */
export function createSceneAuditServedRecord(servedPath, source) {
  const normalizedPath = String(servedPath).replaceAll('\\', '/').replace(/^\.\//, '');
  const bytes = Buffer.isBuffer(source) ? source : Buffer.from(source);
  return {
    path: normalizedPath,
    sha256: sha256(bytes),
    bytes: bytes.length,
  };
}

/** Fingerprint the exact runner/helper/config bytes loaded for one capture. */
export function buildSceneAuditSourceSnapshot(sources = {}) {
  const entries = Object.fromEntries(Object.entries(sources)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => [key, {
      path: value.path,
      sha256: sha256(value.source),
      bytes: Buffer.byteLength(Buffer.isBuffer(value.source) ? value.source : String(value.source)),
    }]));
  return {
    entries,
    fingerprint: sha256(JSON.stringify(entries)),
  };
}

/** Bind evidence to the exact CRLF/binary bytes the local server delivered. */
export function buildSceneAuditServedManifest(records = []) {
  const byPath = new Map();
  for (const record of records) {
    const compact = typeof record.sha256 === 'string' && Number.isFinite(record.bytes)
      ? {
        path: String(record.path).replaceAll('\\', '/').replace(/^\.\//, ''),
        sha256: record.sha256,
        bytes: record.bytes,
      }
      : createSceneAuditServedRecord(record.path, record.bytes);
    if (!compact.path || !isSceneAuditRelativePathContained(compact.path)) {
      throw new Error(`scene audit served path escaped workspace: ${compact.path || '(empty)'}`);
    }
    if (!/^[a-f0-9]{64}$/.test(compact.sha256) || !(compact.bytes >= 0)) {
      throw new Error(`scene audit served record is invalid for ${compact.path}`);
    }
    const entry = { ...compact, responses: 1 };
    const prior = byPath.get(compact.path);
    if (prior && prior.sha256 !== entry.sha256) {
      throw new Error(`scene audit served multiple byte versions for ${compact.path}`);
    }
    if (prior) prior.responses += 1;
    else byPath.set(compact.path, entry);
  }
  const entries = [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path));
  return {
    entries,
    fingerprint: sha256(JSON.stringify(entries.map(({ responses, ...entry }) => entry))),
  };
}

export function buildSceneAuditWorkspaceFingerprint({
  head,
  status = '',
  diff = '',
  untracked = [],
}) {
  const normalizedUntracked = structuredClone(untracked)
    .sort((a, b) => String(a.path).localeCompare(String(b.path)));
  const statusSha256 = sha256(status);
  const diffSha256 = sha256(diff);
  const changedEntries = String(status).split('\0').filter(Boolean).length;
  const fingerprint = sha256(JSON.stringify({
    head,
    statusSha256,
    diffSha256,
    untracked: normalizedUntracked,
  }));
  return {
    dirty: String(status).length > 0,
    changedEntries,
    statusSha256,
    diffSha256,
    untracked: normalizedUntracked,
    fingerprint,
  };
}

export function assertSceneAuditCaptureStable(before, after) {
  if (before?.head !== after?.head) {
    throw new Error(`Git HEAD changed during scene audit: ${before?.head} -> ${after?.head}`);
  }
  if (before?.workspace?.fingerprint !== after?.workspace?.fingerprint) {
    throw new Error('workspace changed during scene audit; evidence was discarded');
  }
  if (before?.sources?.fingerprint !== after?.sources?.fingerprint) {
    throw new Error('audit source changed during scene audit; evidence was discarded');
  }
  return true;
}

/** Validate a path.relative result on Windows, Linux, and macOS. */
export function isSceneAuditAbsoluteAnyPlatform(candidate) {
  return posix.isAbsolute(String(candidate)) || win32.isAbsolute(String(candidate));
}

export function isSceneAuditRelativePathContained(relativePath) {
  const normalized = String(relativePath).replaceAll('\\', '/');
  return !isSceneAuditAbsoluteAnyPlatform(relativePath)
    && normalized !== '..'
    && !normalized.startsWith('../');
}

const DEFAULT_WORKSPACE_PATHS = Object.freeze([
  '*.html',
  'package.json',
  'src',
  'assets',
  'vendor',
  'game',
  'lib',
  'tools/scene-audit.mjs',
  'tools/scene-audit-worker.mjs',
  'tools/scene-audit-scenes.mjs',
  'tools/scene-audit-evidence.mjs',
]);

/** Bind a dirty capture to the exact tracked diff and relevant untracked bytes. */
export function readSceneAuditWorkspace(
  cwd = process.cwd(),
  {
    head = readSceneAuditHead(cwd),
    paths = DEFAULT_WORKSPACE_PATHS,
    execFile = execFileSync,
    readFile = readFileSync,
  } = {},
) {
  const status = execFile('git', [
    'status', '--porcelain=v1', '-z', '--untracked-files=all', '--', ...paths,
  ], { cwd, encoding: 'utf8' });
  const diff = execFile('git', [
    'diff', '--binary', '--no-ext-diff', 'HEAD', '--', ...paths,
  ], { cwd });
  const untrackedPaths = String(status)
    .split('\0')
    .filter((entry) => entry.startsWith('?? '))
    .map((entry) => entry.slice(3));
  const root = resolve(cwd);
  const untracked = untrackedPaths.map((relativePath) => {
    const absolutePath = resolve(root, relativePath);
    if (!isSceneAuditRelativePathContained(relative(root, absolutePath))) {
      throw new Error(`scene audit untracked path escaped workspace: ${relativePath}`);
    }
    const bytes = readFile(absolutePath);
    return {
      path: relativePath.replaceAll('\\', '/'),
      sha256: sha256(bytes),
      bytes: bytes.length,
    };
  });
  return buildSceneAuditWorkspaceFingerprint({ head, status, diff, untracked });
}

export function buildSceneAuditEvidence({
  report,
  scenes,
  head,
  timestamp = new Date().toISOString(),
  tool,
  worker,
  runtimeDependencies = [],
  runtime,
  servedManifest,
  evidenceTool,
  sceneConfig,
  workspace,
}) {
  if (!workspace?.fingerprint) {
    throw new Error('scene audit evidence requires an exact workspace fingerprint');
  }
  if (!runtimeDependencies.length) {
    throw new Error('scene audit evidence requires its transitive runtime dependencies');
  }
  if (
    !runtime?.node?.version
    || !runtime.node.platform
    || !runtime.node.arch
    || !runtime?.playwright?.version
    || !runtime?.browser?.type
    || !runtime.browser.version
    || !runtime.browser.executableSource
    || !runtime.browser.executablePath
    || !Array.isArray(runtime.browser.launchArgs)
    || runtime.browser.launchArgs.some((argument) => typeof argument !== 'string')
  ) {
    throw new Error('scene audit evidence requires complete runtime provenance');
  }
  if (!servedManifest?.fingerprint || !Array.isArray(servedManifest.entries)) {
    throw new Error('scene audit evidence requires the exact served-byte manifest');
  }
  if (scenes.length && servedManifest.entries.length === 0) {
    throw new Error('scene audit served-byte manifest is empty for a nonempty scene selection');
  }
  const servedPaths = new Set(servedManifest.entries.map(({ path: servedPath }) => (
    String(servedPath).replaceAll('\\', '/').replace(/^\/+/, '')
  )));
  const missingLaunchDocuments = [...new Set(scenes.map(({ url }) => (
    decodeURIComponent(new URL(url, 'http://scene-audit.local/').pathname)
      .replaceAll('\\', '/')
      .replace(/^\/+/, '')
  )).filter((launchPath) => !servedPaths.has(launchPath)))];
  if (missingLaunchDocuments.length) {
    throw new Error(
      `scene audit served-byte manifest omitted launch document(s): ${missingLaunchDocuments.join(', ')}`,
    );
  }
  const runtimeSourceEntries = Object.fromEntries(runtimeDependencies.map((dependency, index) => [
    `runtimeDependency:${index}:${dependency.path}`,
    dependency,
  ]));
  const sourceFingerprint = buildSceneAuditSourceSnapshot({
    tool,
    worker,
    evidenceTool,
    sceneConfig,
    ...runtimeSourceEntries,
  }).fingerprint;
  const expectedIds = scenes.map(({ id }) => id);
  const reportedIds = report.map(({ scene }) => scene);
  const expectedSet = new Set(expectedIds);
  const reportedSet = new Set(reportedIds);
  const missing = expectedIds.filter((id) => !reportedSet.has(id));
  const unexpected = [...new Set(reportedIds.filter((id) => !expectedSet.has(id)))];
  const sceneErrors = [];
  for (const entry of report) {
    if (entry.error) sceneErrors.push({ scene: entry.scene, error: entry.error });
    for (const error of entry.pageErrors ?? []) {
      sceneErrors.push({ scene: entry.scene, error: `page error: ${error}` });
    }
    for (const error of entry.consoleErrors ?? []) {
      sceneErrors.push({ scene: entry.scene, error: `console error: ${error}` });
    }
    for (const response of entry.httpErrors ?? []) {
      sceneErrors.push({
        scene: entry.scene,
        error: `HTTP ${response.status}: ${response.url}`,
      });
    }
    for (const url of entry.notFound ?? []) {
      sceneErrors.push({ scene: entry.scene, error: `404: ${url}` });
    }
    for (const failure of entry.requestFailures ?? []) {
      sceneErrors.push({ scene: entry.scene, error: `request failed: ${failure}` });
    }
    for (const failure of entry.collectionErrors ?? []) {
      const identity = failure.name || failure.uuid || '(unnamed mesh)';
      sceneErrors.push({
        scene: entry.scene,
        error: `mesh collection failed: ${identity} — ${failure.error}`,
      });
    }
    if (!entry.error) {
      if (typeof entry.counted !== 'number' || !Number.isFinite(entry.counted)) {
        sceneErrors.push({ scene: entry.scene, error: 'audit omitted a finite positive mesh count' });
      } else if (entry.counted <= 0) {
        sceneErrors.push({ scene: entry.scene, error: 'audit counted zero meshes' });
      }
      if (!Array.isArray(entry.findings)) {
        sceneErrors.push({ scene: entry.scene, error: 'audit omitted its findings array' });
      }
    }
  }
  const coverage = {
    expected: expectedIds.length,
    reported: report.length,
    missing,
    unexpected,
    sceneErrors,
    complete: report.length === expectedIds.length
      && missing.length === 0
      && unexpected.length === 0
      && sceneErrors.length === 0,
  };
  return {
    schema: SCENE_AUDIT_SCHEMA,
    timestamp,
    head,
    sourceFingerprint,
    tool: {
      path: tool.path,
      sha256: sha256(tool.source),
    },
    worker: {
      path: worker.path,
      sha256: sha256(worker.source),
    },
    runtimeDependencies: runtimeDependencies.map((dependency) => ({
      path: dependency.path,
      sha256: sha256(dependency.source),
    })),
    runtime: structuredClone(runtime),
    servedManifest: structuredClone(servedManifest),
    evidenceTool: {
      path: evidenceTool.path,
      sha256: sha256(evidenceTool.source),
    },
    sceneConfig: {
      path: sceneConfig.path,
      sha256: sha256(sceneConfig.source),
      count: scenes.length,
      scenes: structuredClone(scenes),
    },
    workspace: structuredClone(workspace),
    coverage,
    report,
  };
}

export function readSceneAuditHead(cwd = process.cwd()) {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
}

export async function writeSceneAuditEvidenceAtomic(
  outputPath,
  evidence,
  {
    renameFile = rename,
    maxRenameAttempts = 5,
    retryDelayMs = 20,
  } = {},
) {
  if (!outputPath) throw new Error('scene audit evidence output path is required');
  const target = resolve(outputPath);
  const directory = dirname(target);
  const temporary = join(
    directory,
    `.${basename(target)}.${process.pid}.${randomUUID()}.tmp`,
  );
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(temporary, `${JSON.stringify(evidence, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    for (let attempt = 1; attempt <= maxRenameAttempts; attempt++) {
      try {
        await renameFile(temporary, target);
        break;
      } catch (error) {
        const retryable = ['EACCES', 'EBUSY', 'EPERM'].includes(error.code);
        if (!retryable || attempt === maxRenameAttempts) throw error;
        if (retryDelayMs > 0) {
          await new Promise((resolveDelay) => {
            setTimeout(resolveDelay, retryDelayMs * attempt);
          });
        }
      }
    }
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return target;
}
