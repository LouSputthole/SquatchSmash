#!/usr/bin/env node
/**
 * Immutable scene-audit bootstrap.
 *
 * Project modules are deliberately loaded only after their exact bytes have
 * been captured. The worker receives that snapshot, rechecks it before
 * evidence is written, and this bootstrap checks it once more on every exit.
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_PATHS = Object.freeze({
  tool: 'tools/scene-audit.mjs',
  worker: 'tools/scene-audit-worker.mjs',
  evidenceTool: 'tools/scene-audit-evidence.mjs',
  sceneConfig: 'tools/scene-audit-scenes.mjs',
  previewMode: 'src/core/preview-mode.js',
});

const readSources = () => Object.fromEntries(Object.entries(SOURCE_PATHS)
  .map(([key, relativePath]) => [key, {
    path: relativePath,
    source: readFileSync(path.join(ROOT, relativePath)),
  }]));

const fingerprint = (sources) => createHash('sha256')
  .update(JSON.stringify(Object.fromEntries(Object.entries(sources).map(([key, value]) => [
    key,
    {
      path: value.path,
      sha256: createHash('sha256').update(value.source).digest('hex'),
    },
  ]))))
  .digest('hex');

const captureSources = readSources();
const captureFingerprint = fingerprint(captureSources);
const assertBootstrapSourcesStable = () => {
  if (fingerprint(readSources()) !== captureFingerprint) {
    throw new Error('audit source changed after bootstrap snapshot; evidence was discarded');
  }
};

const snapshotRoot = path.join(
  ROOT,
  `.scene-audit-module-snapshot-${process.pid}-${randomUUID()}`,
);
try {
  for (const key of ['worker', 'evidenceTool', 'sceneConfig', 'previewMode']) {
    const target = path.join(snapshotRoot, SOURCE_PATHS[key]);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, captureSources[key].source, { flag: 'wx' });
  }
  const workerUrl = pathToFileURL(path.join(snapshotRoot, SOURCE_PATHS.worker));
  workerUrl.searchParams.set('capture', captureFingerprint);
  const { runSceneAudit } = await import(workerUrl.href);
  assertBootstrapSourcesStable();
  await runSceneAudit({
    root: ROOT,
    captureSources,
    readSources,
  });
} finally {
  rmSync(snapshotRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  assertBootstrapSourcesStable();
}
