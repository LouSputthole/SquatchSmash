import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Give Node the same vendored Three.js module that browser import maps expose.
 *
 * Pages CI intentionally has no install step. Tests that import runtime
 * modules still need the bare `three` specifier to resolve, so this creates an
 * ignored local package before those runtime modules are imported.
 */
export function ensureThreeShim() {
  const dir = path.join(ROOT, 'node_modules', 'three');
  const target = path.join(ROOT, 'vendor', 'three.module.min.js');
  if (!fs.existsSync(target) || fs.statSync(target).size < 100_000) {
    throw new Error('vendor/three.module.min.js is missing or truncated');
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'three', version: '0.0.0-local', type: 'module', exports: './index.js' }),
  );
  fs.writeFileSync(
    path.join(dir, 'index.js'),
    `export * from ${JSON.stringify(pathToFileURL(target).href)};\n`,
  );
}
