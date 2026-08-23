import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  GEOMETRY_WORKER_RESULT_MARKER,
  parseGeometryArguments,
  parseGeometryWorkerOutput,
  reconcileSuppressionPolicy,
  runGeometryWorker,
  scopeGeometryAllowlist,
  selectGeometryStates,
  validateAllowlistSourceFiles,
} from '../tools/verify-geometry.mjs';
import { GEOMETRY_SCENE_STATES } from '../tools/geometry-scenes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('geometry CLI selection is exact, repeatable, and deterministic', () => {
  const options = parseGeometryArguments([
    '--state', 'cartel-palace:approach',
    '--scene', 'mansion-siege',
    '--state', 'cartel-palace:approach',
    '--json',
  ]);
  assert.equal(options.json, true);
  assert.deepEqual(options.scenes, ['mansion-siege']);
  assert.deepEqual(options.states, ['cartel-palace:approach']);
  assert.deepEqual(selectGeometryStates(options).map(({ id }) => id), [
    'cartel-palace:approach',
    'mansion-siege:alert',
    'mansion-siege:checkpoint-armed',
    'mansion-siege:checkpoint-briefed',
    'mansion-siege:checkpoint-wake',
    'mansion-siege:checkpoint-wave-one',
    'mansion-siege:clean',
    'mansion-siege:damaged',
    'mansion-siege:post-battle',
    'mansion-siege:repaired',
    'mansion-siege:under-attack',
  ]);
});

test('focused state runs scope valid policy while retaining malformed and unknown entries', () => {
  const allowlist = {
    scene: 'cartel-palace',
    entries: [
      { id: 'approach', state: 'approach' },
      { id: 'perimeter', state: 'perimeter' },
      { id: 'unknown', state: 'invented' },
      { id: 'malformed' },
      null,
    ],
    suppressionPolicy: [
      { state: 'approach' },
      { state: 'perimeter' },
      { state: 'invented' },
      { malformed: true },
      null,
    ],
  };
  const scoped = scopeGeometryAllowlist(allowlist, {
    scene: 'cartel-palace',
    scans: [{ state: 'approach' }],
  });
  assert.deepEqual(scoped.entries.map((entry) => entry?.id ?? null), [
    'approach',
    'unknown',
    'malformed',
    null,
  ]);
  assert.deepEqual(scoped.suppressionPolicy.map((entry) => entry?.state ?? null), [
    'approach',
    'invented',
    null,
    null,
  ]);
  assert.equal(allowlist.entries.length, 5, 'focused selection must not mutate checked-in policy');
  assert.equal(allowlist.suppressionPolicy.length, 5);
});

test('geometry CLI defaults to all registered states and rejects unknown selectors', () => {
  assert.equal(
    selectGeometryStates(parseGeometryArguments([])).length,
    GEOMETRY_SCENE_STATES.length,
  );
  assert.throws(
    () => selectGeometryStates(parseGeometryArguments(['--scene', 'not-a-scene'])),
    /unknown scene/,
  );
  assert.throws(() => parseGeometryArguments(['--state']), /requires a value/);
  assert.throws(() => parseGeometryArguments(['--wat']), /Unknown argument/);
});

test('parent accepts only an exact worker marker, schema, and state identity', () => {
  const payload = {
    schema: 'squatchsmash.geometry-worker.v1',
    id: 'cartel-palace:approach',
    scene: 'cartel-palace',
    state: 'approach',
    suppressions: { overlap: 0, checkSupport: 0, total: 0, sources: [] },
    scan: { scene: 'cartel-palace', state: 'approach', recordIds: [], findings: [] },
  };
  const output = `headless diagnostic\n${GEOMETRY_WORKER_RESULT_MARKER}${JSON.stringify(payload)}\n`;
  const descriptor = { id: payload.id, scene: payload.scene, state: payload.state };
  assert.deepEqual(parseGeometryWorkerOutput(output, descriptor), payload);
  assert.throws(() => parseGeometryWorkerOutput('{}', descriptor), /no result marker/);
  assert.throws(
    () => parseGeometryWorkerOutput(output, { ...descriptor, id: 'cartel-palace:perimeter' }),
    /wrong schema or descriptor identity/,
  );
  assert.throws(
    () => parseGeometryWorkerOutput(output, { ...descriptor, scene: 'wrong-scene' }),
    /wrong schema or descriptor identity/,
  );
  assert.throws(
    () => parseGeometryWorkerOutput(output, { ...descriptor, state: 'perimeter' }),
    /wrong schema or descriptor identity/,
  );
  const missingSuppressions = { ...payload };
  delete missingSuppressions.suppressions;
  assert.throws(
    () => parseGeometryWorkerOutput(
      `${GEOMETRY_WORKER_RESULT_MARKER}${JSON.stringify(missingSuppressions)}`,
      descriptor,
    ),
    /invalid suppression policy data/,
  );
});

test('parent accepts worker suppression sources in the shared locale-independent order', () => {
  const descriptor = {
    id: 'enolasquatch:detonation',
    scene: 'enolasquatch',
    state: 'detonation',
  };
  const source = (sourceId) => ({
    sourceId,
    scope: 'direct',
    overlap: 1,
    checkSupport: 0,
    origins: ['userData.geometryGate.overlap'],
  });
  const sources = [
    source('root:enolasquatch-detonation/name=Z#0'),
    source('root:enolasquatch-detonation/name=_#0'),
  ];
  const payload = {
    schema: 'squatchsmash.geometry-worker.v1',
    ...descriptor,
    suppressions: { overlap: 2, checkSupport: 0, total: 2, sources },
    scan: { scene: descriptor.scene, state: descriptor.state, recordIds: [], findings: [] },
  };
  const serialize = (value) => (
    `${GEOMETRY_WORKER_RESULT_MARKER}${JSON.stringify(value)}`
  );

  assert.deepEqual(parseGeometryWorkerOutput(serialize(payload), descriptor), payload);
  assert.throws(
    () => parseGeometryWorkerOutput(serialize({
      ...payload,
      suppressions: { ...payload.suppressions, sources: [...sources].reverse() },
    }), descriptor),
    /non-canonical suppression sources/,
  );
});

test('repeated real workers emit byte-stable payloads for procedural scene geometry', async () => {
  const descriptor = GEOMETRY_SCENE_STATES.find(({ id }) => id === 'bing:visit-one');
  assert.ok(descriptor, 'bing:visit-one descriptor is registered');
  const first = await runGeometryWorker(descriptor);
  const second = await runGeometryWorker(descriptor);
  assert.equal(JSON.stringify(second), JSON.stringify(first));
});

test('allowlist citations require an existing nonblank in-range line and optional stable anchor', async () => {
  await validateAllowlistSourceFiles({
    entries: [{ source: 'package.json:1', sourceAnchor: '{' }],
  }, { repositoryRoot: ROOT });

  const cases = [
    ['SOURCE_FILE_MISSING', 'src/does-not-exist.js:1'],
    ['SOURCE_LINE_OUT_OF_RANGE', 'package.json:999999'],
    ['SOURCE_LINE_BLANK', 'docs/GEOMETRY-GATE.md:2'],
    ['SOURCE_ANCHOR_MISMATCH', 'package.json:1', 'definitely-not-on-line-one'],
  ];
  for (const [expectedCode, sourceCitation, sourceAnchor] of cases) {
    await assert.rejects(
      () => validateAllowlistSourceFiles({
        entries: [{
          source: sourceCitation,
          ...(sourceAnchor ? { sourceAnchor } : {}),
        }],
      }, { repositoryRoot: ROOT }),
      (error) => error.issues?.some(({ code }) => code === expectedCode),
      expectedCode,
    );
  }
});

test('suppression growth and exact source drift are blocking configuration errors', () => {
  const source = {
    sourceId: 'root:test/name=fixture#0',
    scope: 'direct',
    overlap: 1,
    checkSupport: 0,
  };
  const allowlist = {
    suppressionPolicy: [{
      state: 'default',
      overlap: 1,
      checkSupport: 0,
      sources: [source],
    }],
  };
  const payload = (overrides = {}) => ({
    state: 'default',
    suppressions: {
      overlap: 1,
      checkSupport: 0,
      total: 1,
      sources: [{ ...source, origins: ['userData.geometryGate.overlap'] }],
      ...overrides,
    },
  });
  assert.doesNotThrow(() => reconcileSuppressionPolicy({ allowlist, payloads: [payload()] }));
  assert.throws(
    () => reconcileSuppressionPolicy({
      allowlist,
      payloads: [payload({ overlap: 2, total: 2 })],
    }),
    (error) => error.issues?.some(({ code }) => code === 'SUPPRESSION_COUNT_DRIFT'),
  );
  assert.throws(
    () => reconcileSuppressionPolicy({
      allowlist,
      payloads: [payload({
        sources: [{
          ...source,
          sourceId: 'root:test/name=new-fixture#0',
          origins: ['userData.geometryGate.overlap'],
        }],
      })],
    }),
    (error) => error.issues?.some(({ code }) => code === 'SUPPRESSION_SOURCE_DRIFT'),
  );
});

test('documented focused state command succeeds with a multi-state scene allowlist', () => {
  const run = spawnSync(process.execPath, [
    'tools/verify-geometry.mjs',
    '--state',
    'graveyard:arrival',
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.ok(run.stdout.includes('Geometry gate passed: 1/1 states'), run.stdout);
});

test('every registered scene owns one exact checked-in allowlist', async () => {
  const scenes = [...new Set(GEOMETRY_SCENE_STATES.map(({ scene }) => scene))].sort();
  for (const scene of scenes) {
    const filename = path.join(ROOT, 'tools', 'geometry-allowlists', `${scene}.json`);
    const allowlist = JSON.parse(await readFile(filename, 'utf8'));
    assert.equal(allowlist.$schema, 'squatchsmash.geometry-allowlist.v1', filename);
    assert.equal(allowlist.scene, scene, filename);
    assert.ok(Array.isArray(allowlist.entries), filename);
    assert.ok(Array.isArray(allowlist.suppressionPolicy), filename);
  }
});

test('npm and pull-request CI expose the geometry gate before browser setup', async () => {
  const packageJson = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts['verify:geometry'], 'node tools/verify-geometry.mjs');

  const workflow = await readFile(path.join(ROOT, '.github', 'workflows', 'verify.yml'), 'utf8');
  assert.match(workflow, /on:\s*[\s\S]*push:\s*[\s\S]*- main/);
  assert.match(workflow, /on:\s*[\s\S]*merge_group:/);
  const gateIndex = workflow.indexOf('run: npm run verify:geometry');
  const playwrightIndex = workflow.indexOf('run: npx playwright install --with-deps chromium');
  assert.ok(gateIndex >= 0, 'pull-request CI does not run the geometry gate');
  assert.ok(playwrightIndex >= 0, 'pull-request CI lost its browser dependency setup');
  assert.ok(gateIndex < playwrightIndex, 'geometry gate must fail before expensive browser setup');
  assert.doesNotMatch(
    workflow.slice(Math.max(0, gateIndex - 120), gateIndex + 120),
    /continue-on-error:\s*true/,
  );
});
