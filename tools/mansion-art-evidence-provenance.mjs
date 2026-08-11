import { createHash } from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';

/** Snapshot provenance contract for fresh Mansion-art browser evidence. */

async function sha256File(file) {
  return createHash('sha256').update(await fsp.readFile(file)).digest('hex');
}

function sha256Value(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableStringify(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function relativePath(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

async function hashedFile(root, relative) {
  const file = path.join(root, relative);
  const stat = await fsp.stat(file);
  return {
    path: relativePath(root, file),
    bytes: stat.size,
    sha256: await sha256File(file),
  };
}

function staticImportSpecifiers(source) {
  const found = [];
  for (const pattern of [
    /\b(?:import|export)\s+(?:[^;]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]) {
    for (let match = pattern.exec(source); match; match = pattern.exec(source)) found.push(match[1]);
  }
  return found;
}

async function resolveRelativeImport(root, importer, specifier) {
  if (!specifier.startsWith('.')) return null;
  const clean = specifier.split(/[?#]/, 1)[0];
  const base = path.resolve(root, path.dirname(importer), clean);
  const candidates = path.extname(base)
    ? [base]
    : [base, `${base}.js`, `${base}.mjs`, path.join(base, 'index.js')];
  const rootPath = path.resolve(root);
  for (const candidate of candidates) {
    if (!candidate.startsWith(`${rootPath}${path.sep}`)) {
      throw new Error(`Runtime import escapes repository: ${importer} -> ${specifier}.`);
    }
    try {
      if ((await fsp.stat(candidate)).isFile()) return relativePath(rootPath, candidate);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  throw new Error(`Unresolved runtime import: ${importer} -> ${specifier}.`);
}

export async function buildStaticImportRuntimeProvenance({ root, entryFiles, extraFiles = [] }) {
  const rootPath = path.resolve(root);
  const queue = entryFiles.map((file) => relativePath(rootPath, path.resolve(rootPath, file)));
  const visited = new Set();
  while (queue.length) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);
    const source = await fsp.readFile(path.join(rootPath, current), 'utf8');
    for (const specifier of staticImportSpecifiers(source)) {
      const resolved = await resolveRelativeImport(rootPath, current, specifier);
      if (resolved && !visited.has(resolved)) queue.push(resolved);
    }
  }
  const paths = [...new Set([...visited, ...extraFiles])].sort();
  const entries = await Promise.all(paths.map((file) => hashedFile(rootPath, file)));
  return { sha256: sha256Value(entries), entries };
}

function normalizedShot(shot) {
  return {
    name: shot.name,
    room: shot.room,
    slot: shot.slot,
    file: shot.file,
    position: [...shot.position],
    railProof: shot.railProof === true,
    allowPerimeterOcclusion: shot.allowPerimeterOcclusion === true,
  };
}

export async function buildMansionArtCaptureProvenance({ root, shots }) {
  const runtime = await buildStaticImportRuntimeProvenance({
    root,
    entryFiles: ['src/mansion/main.js', 'src/core/boot-guard.js'],
    extraFiles: ['mansion.html', 'vendor/three.module.min.js'],
  });

  const manifestFile = path.join(root, 'assets', 'art', 'manifest.json');
  const manifestStat = await fsp.stat(manifestFile);
  const manifest = JSON.parse(await fsp.readFile(manifestFile, 'utf8'));
  const manifestRecord = {
    path: relativePath(root, manifestFile),
    bytes: manifestStat.size,
    sha256: await sha256File(manifestFile),
  };

  const shotEntries = shots.map(normalizedShot);
  const artEntries = [];
  const artRoot = path.resolve(root, 'assets', 'art');
  for (const shot of shotEntries) {
    const rows = manifest.art?.filter((row) => row.slot === shot.slot) ?? [];
    if (rows.length !== 1 || rows[0].file !== shot.file) {
      throw new Error(`Manifest drift for ${shot.slot}: expected exactly ${shot.file}.`);
    }
    const artFile = path.resolve(artRoot, rows[0].file);
    if (!artFile.startsWith(`${artRoot}${path.sep}`)) {
      throw new Error(`Manifest art path escapes assets/art for ${shot.slot}.`);
    }
    const hashed = await hashedFile(root, relativePath(root, artFile));
    artEntries.push({ slot: shot.slot, file: shot.file, ...hashed });
  }

  const toolPaths = [
    'tools/verify-mansion-art.mjs',
    'tools/mansion-art-evidence-contract.mjs',
    'tools/mansion-art-evidence-provenance.mjs',
  ];
  const toolEntries = await Promise.all(toolPaths.map((file) => hashedFile(root, file)));
  const capture = {
    schema: 1,
    entry: 'mansion.html?preview=1',
    runtime,
    manifest: manifestRecord,
    shots: { sha256: sha256Value(shotEntries), entries: shotEntries },
    art: { sha256: sha256Value(artEntries), entries: artEntries },
    tools: { sha256: sha256Value(toolEntries), entries: toolEntries },
  };
  return { ...capture, fingerprint: sha256Value(capture) };
}

export async function collectMansionArtEvidence({ outDir, shots }) {
  const evidence = [];
  for (const shot of shots) {
    const file = path.join(outDir, `${shot.name}.png`);
    const handle = await fsp.open(file, 'r');
    try {
      const header = Buffer.alloc(24);
      const { bytesRead } = await handle.read(header, 0, header.length, 0);
      const stat = await handle.stat();
      const isPng = bytesRead === 24 && header.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
      const width = isPng ? header.readUInt32BE(16) : 0;
      const height = isPng ? header.readUInt32BE(20) : 0;
      if (!isPng || width !== 1280 || height !== 720 || stat.size < 10_000) {
        throw new Error(`Invalid Mansion art evidence ${path.basename(file)}: ${width}x${height}, ${stat.size} bytes.`);
      }
      evidence.push({
        name: shot.name,
        file: path.basename(file),
        bytes: stat.size,
        width,
        height,
        sha256: await sha256File(file),
      });
    } finally {
      await handle.close();
    }
  }
  return evidence;
}

export function bindMansionArtEvidenceProvenance({ capture, evidence, mode }) {
  return {
    schema: 1,
    mode,
    capture,
    evidence,
    evidenceFingerprint: sha256Value(evidence),
  };
}
