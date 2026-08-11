import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  bindMansionArtEvidenceProvenance,
  buildMansionArtCaptureProvenance,
  buildStaticImportRuntimeProvenance,
  collectMansionArtEvidence,
} from '../tools/mansion-art-evidence-provenance.mjs';
import {
  MANSION_ART_EVIDENCE_SHOTS,
  parseMansionArtEvidenceRun,
  resolveMansionArtNullSightline,
} from '../tools/mansion-art-evidence-contract.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const EVIDENCE_DIR = fileURLToPath(new URL(
  '../docs/validation/2026-08-10/mansion-art/final/', import.meta.url,
));
const SHOT_NAMES = [
  '01-gallery-roster', '02-ballroom-major', '03-lounge-cowboy',
  '04-conference-stacks', '05-office-boss', '06-winter-almighty',
  '07-cellar-party-bus', '08-guest-dog', '09-theatre-lockup',
  '10-lan-denver', '11-vault-facing-casa-bonita',
];

test('the CLI contract rejects every retained-PNG reuse mode', () => {
  assert.throws(
    () => parseMansionArtEvidenceRun(['review', 'office-refresh']),
    /retained screenshot reuse is disabled.*fresh full 11-shot capture/i,
  );
  assert.deepEqual(parseMansionArtEvidenceRun(['review', 'all']), {
    label: 'review',
    mode: 'all',
  });
});

test('the package Mansion-art command explicitly requests only a full capture', async () => {
  const pkg = JSON.parse(await fsp.readFile(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['verify:mansion-art'], 'node tools/verify-mansion-art.mjs final all');
});

test('a null art ray is clear only when all four micro-neighborhood retries hit the target', () => {
  const target = { name: 'picture' };
  const blocker = { name: 'clock' };

  assert.equal(resolveMansionArtNullSightline({ primary: target, target, retries: [] }), target);
  assert.equal(resolveMansionArtNullSightline({
    primary: null,
    target,
    retries: [target, target, target, target],
  }), target);
  assert.equal(resolveMansionArtNullSightline({
    primary: null,
    target,
    retries: [target, target, blocker, target],
  }), blocker, 'a real opaque blocker was weakened into a clear sample');
  assert.equal(resolveMansionArtNullSightline({
    primary: null,
    target,
    retries: [target, target, null, target],
  }), null, 'a second raycast miss was weakened into a clear sample');
  assert.throws(
    () => resolveMansionArtNullSightline({ primary: null, target, retries: [target] }),
    /exactly four micro-neighborhood retries/i,
  );
});

test('evidence collection binds all eleven PNGs by bytes, dimensions, and SHA-256', async () => {
  const evidence = await collectMansionArtEvidence({
    outDir: EVIDENCE_DIR,
    shots: SHOT_NAMES.map((name) => ({ name })),
  });

  assert.equal(evidence.length, 11);
  assert.deepEqual(evidence.map((item) => item.name), SHOT_NAMES);
  for (const item of evidence) {
    assert.equal(item.width, 1280, `${item.name} width drifted`);
    assert.equal(item.height, 720, `${item.name} height drifted`);
    assert.ok(item.bytes >= 10_000, `${item.name} is not a real screenshot`);
    assert.match(item.sha256, /^[a-f0-9]{64}$/);
  }
});

test('capture provenance binds all eleven slot-camera contracts, runtime sources, manifest, art, and tools', async () => {
  const capture = await buildMansionArtCaptureProvenance({
    root: ROOT,
    shots: MANSION_ART_EVIDENCE_SHOTS,
  });

  assert.equal(capture.schema, 1);
  assert.match(capture.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(capture.shots.entries.length, 11);
  assert.equal(capture.art.entries.length, 11);
  assert.equal(new Set(capture.shots.entries.map((shot) => shot.slot)).size, 11);
  assert.deepEqual(
    capture.art.entries.map(({ slot, file }) => [slot, file]),
    capture.shots.entries.map(({ slot, file }) => [slot, file]),
  );
  assert.ok(capture.runtime.entries.length >= 4);
  const runtimePaths = new Set(capture.runtime.entries.map((entry) => entry.path));
  for (const importedSource of [
    'src/mansion/cast.js',
    'src/bing/cast.js',
    'src/bing/family.js',
    'src/bing/family-ape.js',
    'src/bing/script.js',
    'src/silver/margo.js',
  ]) {
    assert.ok(runtimePaths.has(importedSource), `runtime provenance omitted ${importedSource}`);
  }
  assert.ok(capture.tools.entries.length >= 3);
  for (const group of [capture.runtime, capture.art, capture.tools]) {
    assert.match(group.sha256, /^[a-f0-9]{64}$/);
    assert.ok(group.entries.every((entry) => /^[a-f0-9]{64}$/.test(entry.sha256)));
  }
  assert.match(capture.manifest.sha256, /^[a-f0-9]{64}$/);
  assert.match(capture.shots.sha256, /^[a-f0-9]{64}$/);

  const movedShots = structuredClone(MANSION_ART_EVIDENCE_SHOTS);
  movedShots[0].position[0] += 0.01;
  const moved = await buildMansionArtCaptureProvenance({ root: ROOT, shots: movedShots });
  assert.notEqual(moved.shots.sha256, capture.shots.sha256);
  assert.notEqual(moved.fingerprint, capture.fingerprint);
  assert.equal(moved.art.sha256, capture.art.sha256,
    'camera drift must not masquerade as changed art bytes');
});

test('report provenance binds the capture fingerprint to the exact screenshot set', () => {
  const capture = { fingerprint: 'capture-fingerprint' };
  const evidence = [{ name: '01-gallery-roster', sha256: 'png-one' }];
  const bound = bindMansionArtEvidenceProvenance({ capture, evidence, mode: 'all' });

  assert.equal(bound.schema, 1);
  assert.equal(bound.mode, 'all');
  assert.equal(bound.capture, capture);
  assert.equal(bound.evidence, evidence);
  assert.match(bound.evidenceFingerprint, /^[a-f0-9]{64}$/);
  const changed = bindMansionArtEvidenceProvenance({
    capture,
    evidence: [{ name: '01-gallery-roster', sha256: 'png-two' }],
    mode: 'all',
  });
  assert.notEqual(changed.evidenceFingerprint, bound.evidenceFingerprint);
});

test('runtime provenance follows transitive static imports and changes when an imported actor source changes', async () => {
  const prefix = path.join(ROOT, '.tmp-mansion-art-imports-');
  const fixtureRoot = await fsp.mkdtemp(prefix);
  try {
    await fsp.mkdir(path.join(fixtureRoot, 'src', 'bing'), { recursive: true });
    await fsp.mkdir(path.join(fixtureRoot, 'src', 'silver'), { recursive: true });
    await fsp.writeFile(path.join(fixtureRoot, 'entry.js'), "import './src/cast.js';\n");
    await fsp.writeFile(path.join(fixtureRoot, 'src', 'cast.js'), "import './bing/family.js';\n");
    await fsp.writeFile(path.join(fixtureRoot, 'src', 'bing', 'family.js'), "import '../../src/silver/margo.js';\n");
    const margo = path.join(fixtureRoot, 'src', 'silver', 'margo.js');
    await fsp.writeFile(margo, 'export const outfit = 1;\n');

    const before = await buildStaticImportRuntimeProvenance({
      root: fixtureRoot,
      entryFiles: ['entry.js'],
    });
    assert.deepEqual(before.entries.map((entry) => entry.path), [
      'entry.js', 'src/bing/family.js', 'src/cast.js', 'src/silver/margo.js',
    ]);

    await fsp.writeFile(margo, 'export const outfit = 2;\n');
    const after = await buildStaticImportRuntimeProvenance({
      root: fixtureRoot,
      entryFiles: ['entry.js'],
    });
    assert.notEqual(after.sha256, before.sha256,
      'a transitive actor-source edit did not invalidate reusable screenshots');
  } finally {
    const resolved = path.resolve(fixtureRoot);
    if (!resolved.startsWith(path.resolve(prefix))) throw new Error(`unsafe fixture cleanup target ${resolved}`);
    await fsp.rm(resolved, { recursive: true, force: true });
  }
});
