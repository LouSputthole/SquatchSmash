import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GEOMETRY_ALLOWLIST_SCHEMA,
  GEOMETRY_FINDING_KINDS,
  GEOMETRY_THRESHOLDS,
  GeometryGateConfigError,
  GeometryGateInputError,
  geometryRecordsFromSnapshot,
  normalizeGeometryRecords,
  reconcileGeometryAllowlist,
  runGeometryGate,
  scanGeometry,
  sweepGeometryPairs,
  validateGeometryAllowlist,
} from '../tools/geometry-gate.mjs';

function box(id, bounds = {}, policy = {}) {
  return {
    id,
    minX: bounds.minX ?? 0,
    minY: bounds.minY ?? 0,
    minZ: bounds.minZ ?? 0,
    maxX: bounds.maxX ?? 1,
    maxY: bounds.maxY ?? 1,
    maxZ: bounds.maxZ ?? 1,
    ...policy,
  };
}

function emptyAllowlist(scene = 'test-scene', states = ['default']) {
  return {
    $schema: GEOMETRY_ALLOWLIST_SCHEMA,
    scene,
    entries: [],
    suppressionPolicy: [...states].sort().map((state) => ({
      state,
      overlap: 0,
      checkSupport: 0,
      sources: [],
    })),
  };
}

function pairEntry(finding, overrides = {}) {
  return {
    id: 'fitted-range-join',
    state: finding.state,
    kind: finding.kind,
    left: finding.left,
    right: finding.right,
    maxDepthM: finding.depthM,
    reason: 'The fitted range intentionally keys into its cabinet surround.',
    source: 'src/scenes/test-scene.js:42',
    ...overrides,
  };
}

function floatingEntry(finding, overrides = {}) {
  return {
    id: 'suspended-service-run',
    state: finding.state,
    kind: GEOMETRY_FINDING_KINDS.FLOATING,
    object: finding.object,
    maxGapM: finding.gapM ?? 1,
    reason: 'The suspended service run is visibly fixed to overhead hangers.',
    source: 'src/scenes/test-scene.js:84',
    ...overrides,
  };
}

function issueCodes(error) {
  return error instanceof GeometryGateConfigError
    ? error.issues.map((issue) => issue.code)
    : [];
}

test('normalizeGeometryRecords returns stable numeric records sorted by exact ID', () => {
  const normalized = normalizeGeometryRecords([
    box('z-last', {}, { ownerId: 'assembly/z', supports: true }),
    box('a-first'),
  ]);

  assert.deepEqual(normalized.map((record) => record.id), ['a-first', 'z-last']);
  assert.equal(normalized[0].ownerId, 'a-first');
  assert.equal(normalized[0].supportOwnerId, 'a-first');
  assert.equal(normalized[1].supportOwnerId, 'assembly/z');
  assert.equal(normalized[0].overlapLayer, 'default');
  assert.equal(normalized[0].overlap, true);
  assert.equal(normalized[0].supports, false);
  assert.equal(normalized[0].fixedSupportAnchor, false);
  assert.equal(normalized[0].checkSupport, false);
  assert.equal(Object.isFrozen(normalized[0]), true);
});

test('normalizeGeometryRecords rejects malformed, unstable, and ambiguous records', () => {
  class BoxRecord {}
  const cases = [
    [null, 'records must be an array'],
    [[new BoxRecord()], 'plain object'],
    [[box('bad*glob')], 'stable ID'],
    [[{ ...box('unknown-key'), surprise: true }], 'unknown key'],
    [[box('nan-box', { maxX: Number.NaN })], 'finite number'],
    [[box('flat-box', { maxX: 0 })], 'strictly positive bounds'],
    [[box('duplicate'), box('duplicate', { minX: 2, maxX: 3 })], 'Duplicate'],
    [[box('bad-flag', {}, { supports: 'yes' })], 'must be a boolean'],
    [[box('bad-anchor', {}, { fixedSupportAnchor: 'yes' })], 'must be a boolean'],
    [[box('bad-axis', {}, { wallAxis: 'y' })], 'wallAxis'],
    [[box('bad-layer', {}, { overlapLayer: 'visual*' })], 'stable ID'],
    [[box('bad-support-owner', {}, { supportOwnerId: 'assembly*' })], 'stable ID'],
  ];

  for (const [records, message] of cases) {
    assert.throws(
      () => normalizeGeometryRecords(records),
      (error) => error instanceof GeometryGateInputError && error.message.includes(message),
    );
  }
});

test('geometryRecordsFromSnapshot adapts collector items and colliders at one seam', () => {
  const records = geometryRecordsFromSnapshot({
    items: [{
      id: 'root:lab/name=coolant%20pipe#0',
      assemblyId: 'assembly:services/name=run%231#0',
      structural: false,
      wall: false,
      min: { x: 1, y: 2, z: 3 },
      max: { x: 2, y: 3, z: 4 },
    }],
    colliders: [{
      id: 'floor/collider',
      structural: true,
      min: [-2, -1, -2],
      max: [2, 0, 2],
    }],
    collectionErrors: [],
  });

  assert.equal(records[0].id, 'floor/collider');
  assert.equal(records[0].overlapLayer, 'collider');
  assert.equal(records[0].supports, true);
  assert.equal(records[0].fixedSupportAnchor, true);
  assert.equal(records[0].checkSupport, false);
  assert.equal(records[1].id, 'root:lab/name=coolant%20pipe#0');
  assert.equal(records[1].ownerId, 'assembly:services/name=run%231#0');
  assert.equal(records[1].supportOwnerId, 'assembly:services/name=run%231#0');
  assert.equal(records[1].overlapLayer, 'visual');
  assert.equal(records[1].fixedSupportAnchor, false);
  assert.equal(records[1].checkSupport, true);
  assert.equal(records[1].minY, 2);

  const scan = scanGeometry({ scene: 'test-scene', records });
  assert.equal(scan.recordCount, 2);

  const [explicit] = geometryRecordsFromSnapshot({
    items: [{
      id: 'root:lab/name=explicit-layer#0',
      overlapLayer: 'effects',
      min: { x: 0, y: 0, z: 0 },
      max: { x: 1, y: 1, z: 1 },
    }],
    colliders: [],
  });
  assert.equal(explicit.overlapLayer, 'effects');
});

test('sweepGeometryPairs matches an independent brute-force oracle', () => {
  let seed = 0x1badf00d;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };

  for (let world = 0; world < 40; world += 1) {
    const records = Array.from({ length: 75 }, (_, index) => {
      const minX = random() * 30 - 15;
      const minY = random() * 10 - 5;
      const minZ = random() * 30 - 15;
      return box(`world-${world}/box-${index}`, {
        minX,
        minY,
        minZ,
        maxX: minX + 0.01 + random() * 8,
        maxY: minY + 0.01 + random() * 5,
        maxZ: minZ + 0.01 + random() * 8,
      });
    });
    const normalized = normalizeGeometryRecords(records);
    const expected = [];
    for (let left = 0; left < normalized.length; left += 1) {
      for (let right = left + 1; right < normalized.length; right += 1) {
        const a = normalized[left];
        const b = normalized[right];
        if (a.maxX > b.minX && b.maxX > a.minX && a.maxZ > b.minZ && b.maxZ > a.minZ) {
          expected.push(`${a.id}|${b.id}`);
        }
      }
    }
    const actual = [...sweepGeometryPairs(records)].map(([left, right]) => `${left.id}|${right.id}`);
    assert.deepEqual(actual.sort(), expected.sort(), `world ${world}`);
  }
});

test('sweepGeometryPairs has no hidden result cap', () => {
  const records = Array.from({ length: 100 }, (_, index) => box(`box-${String(index).padStart(3, '0')}`));
  const pairs = [...sweepGeometryPairs(records)];

  assert.equal(pairs.length, 4_950);
  assert.deepEqual(pairs.at(-1).map((record) => record.id), ['box-098', 'box-099']);
});

test('interpenetration uses strict greater-than 3 cm', () => {
  const atThreshold = scanGeometry({
    scene: 'test-scene',
    records: [box('large'), box('thin', { maxX: GEOMETRY_THRESHOLDS.overlapM })],
  });
  const aboveThreshold = scanGeometry({
    scene: 'test-scene',
    records: [box('large'), box('thin', { maxX: GEOMETRY_THRESHOLDS.overlapM + 0.000001 })],
  });

  assert.equal(atThreshold.findings.length, 0);
  assert.equal(aboveThreshold.findings.length, 1);
  assert.equal(aboveThreshold.findings[0].kind, GEOMETRY_FINDING_KINDS.INTERPENETRATION);
});

test('wall embedding uses strict greater-than 2 cm', () => {
  const object = box('suite/object');
  const wallAtThreshold = box(
    'suite/wall',
    { maxX: GEOMETRY_THRESHOLDS.wallEmbedM },
    { wall: true, wallAxis: 'x' },
  );
  const wallAboveThreshold = box(
    'suite/wall',
    { maxX: GEOMETRY_THRESHOLDS.wallEmbedM + 0.000001 },
    { wall: true, wallAxis: 'x' },
  );

  assert.equal(scanGeometry({ scene: 'test-scene', records: [object, wallAtThreshold] }).findings.length, 0);
  const result = scanGeometry({ scene: 'test-scene', records: [object, wallAboveThreshold] });
  assert.equal(result.findings[0].kind, GEOMETRY_FINDING_KINDS.WALL_EMBED);
  assert.equal(result.findings[0].wall, 'suite/wall');
});

test('floating uses strict greater-than 4 cm and pipes are not exempt', () => {
  const support = box(
    'lab/floor',
    { minX: -1, minY: -1, minZ: -1, maxX: 2, maxY: 0, maxZ: 2 },
    { overlap: false, supports: true },
  );
  const atThreshold = box(
    'lab/coolant-pipe',
    { minY: GEOMETRY_THRESHOLDS.floatGapM, maxY: 1 },
    { checkSupport: true },
  );
  const aboveThreshold = box(
    'lab/coolant-pipe',
    { minY: GEOMETRY_THRESHOLDS.floatGapM + 0.000001, maxY: 1 },
    { checkSupport: true },
  );

  assert.equal(scanGeometry({ scene: 'test-scene', records: [support, atThreshold] }).findings.length, 0);
  const result = scanGeometry({ scene: 'test-scene', records: [support, aboveThreshold] });
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].kind, GEOMETRY_FINDING_KINDS.FLOATING);
  assert.equal(result.findings[0].object, 'lab/coolant-pipe');
});

test('side-mounted and ceiling-attached records are supported within 4 cm', () => {
  const fixtures = [
    {
      support: box(
        'suite/wall-mount',
        { minX: -1, minY: 0, minZ: 0, maxX: 0, maxY: 2, maxZ: 2 },
        { overlap: false, supports: true, wall: true },
      ),
      object: box(
        'suite/wall-fixture',
        {
          minX: GEOMETRY_THRESHOLDS.floatGapM,
          minY: 0.5,
          minZ: 0.5,
          maxX: 1,
          maxY: 1.5,
          maxZ: 1.5,
        },
        { checkSupport: true },
      ),
    },
    {
      support: box(
        'suite/ceiling-mount',
        {
          minX: 0,
          minY: 1 + GEOMETRY_THRESHOLDS.floatGapM,
          minZ: 0,
          maxX: 1,
          maxY: 2,
          maxZ: 1,
        },
        { overlap: false, supports: true, fixedSupportAnchor: true },
      ),
      object: box('suite/ceiling-fixture', {}, { checkSupport: true }),
    },
  ];

  for (const { support, object } of fixtures) {
    const result = scanGeometry({ scene: 'test-scene', records: [support, object] });
    assert.equal(
      result.findings.some((finding) => finding.kind === GEOMETRY_FINDING_KINDS.FLOATING),
      false,
      object.id,
    );
  }
});

test('an object enclosed by a fixed anchor volume is still floating', () => {
  const wallVolume = box(
    'suite/wall-volume',
    { minX: 0, minY: 0, minZ: 0, maxX: 10, maxY: 10, maxZ: 10 },
    { overlap: false, supports: true, fixedSupportAnchor: true },
  );
  const enclosed = box(
    'suite/enclosed-crate',
    { minX: 4, minY: 4, minZ: 4, maxX: 5, maxY: 5, maxZ: 5 },
    { overlap: false, checkSupport: true },
  );

  const result = scanGeometry({ scene: 'test-scene', records: [wallVolume, enclosed] });
  assert.deepEqual(
    result.findings
      .filter(({ kind }) => kind === GEOMETRY_FINDING_KINDS.FLOATING)
      .map(({ object }) => object),
    ['suite/enclosed-crate'],
  );
});

test('side-touching airborne owners cannot mutually support each other', () => {
  const left = box(
    'airborne/left',
    { minX: 0, minY: 1, minZ: 0, maxX: 1, maxY: 2, maxZ: 1 },
    { overlap: false, supports: true, checkSupport: true },
  );
  const right = box(
    'airborne/right',
    { minX: 1, minY: 1, minZ: 0, maxX: 2, maxY: 2, maxZ: 1 },
    { overlap: false, supports: true, checkSupport: true },
  );

  const result = scanGeometry({ scene: 'test-scene', records: [left, right] });
  assert.deepEqual(
    result.findings
      .filter(({ kind }) => kind === GEOMETRY_FINDING_KINDS.FLOATING)
      .map(({ object }) => object),
    ['airborne/left', 'airborne/right'],
  );
});

test('equal-height airborne owners cannot form a vertical support cycle', () => {
  const first = box(
    'airborne/equal-a',
    { minX: 0, minY: 1, minZ: 0, maxX: 1, maxY: 1.02, maxZ: 1 },
    { overlap: false, supports: true, checkSupport: true },
  );
  const second = box(
    'airborne/equal-b',
    { minX: 0, minY: 1, minZ: 0, maxX: 1, maxY: 1.02, maxZ: 1 },
    { overlap: false, supports: true, checkSupport: true },
  );

  const result = scanGeometry({ scene: 'test-scene', records: [first, second] });
  assert.deepEqual(
    result.findings
      .filter(({ kind }) => kind === GEOMETRY_FINDING_KINDS.FLOATING)
      .map(({ object }) => object),
    ['airborne/equal-a', 'airborne/equal-b'],
  );
});

test('an airborne vertical stack reports only its unsupported bottom owner', () => {
  const bottom = box(
    'stack/bottom',
    { minX: 0, minY: 1, minZ: 0, maxX: 1, maxY: 2, maxZ: 1 },
    { overlap: false, supports: true, checkSupport: true },
  );
  const top = box(
    'stack/top',
    { minX: 0, minY: 2, minZ: 0, maxX: 1, maxY: 3, maxZ: 1 },
    { overlap: false, supports: true, checkSupport: true },
  );

  const result = scanGeometry({ scene: 'test-scene', records: [bottom, top] });
  assert.deepEqual(
    result.findings
      .filter(({ kind }) => kind === GEOMETRY_FINDING_KINDS.FLOATING)
      .map(({ object }) => object),
    ['stack/bottom'],
  );
});

test('a vertical stack grounded on a fixed anchor passes support checks', () => {
  const ground = box(
    'stack/ground',
    { minX: -1, minY: 0, minZ: -1, maxX: 2, maxY: 1, maxZ: 2 },
    { overlap: false, supports: true, fixedSupportAnchor: true },
  );
  const bottom = box(
    'stack/bottom',
    { minX: 0, minY: 1, minZ: 0, maxX: 1, maxY: 2, maxZ: 1 },
    { overlap: false, supports: true, checkSupport: true },
  );
  const top = box(
    'stack/top',
    { minX: 0, minY: 2, minZ: 0, maxX: 1, maxY: 3, maxZ: 1 },
    { overlap: false, supports: true, checkSupport: true },
  );

  const result = scanGeometry({
    scene: 'test-scene',
    records: [top, ground, bottom],
  });
  assert.deepEqual(
    result.findings.filter(({ kind }) => kind === GEOMETRY_FINDING_KINDS.FLOATING),
    [],
  );
});

test('a disconnected pipe still floats and same-owner contact does not attach it', () => {
  const floor = box(
    'lab/floor',
    { minX: -1, minY: -1, minZ: -1, maxX: 2, maxY: 0, maxZ: 2 },
    { overlap: false, supports: true },
  );
  const pipe = box(
    'lab/disconnected-pipe',
    { minY: GEOMETRY_THRESHOLDS.floatGapM + 0.000001, maxY: 1 },
    { checkSupport: true },
  );
  const disconnected = scanGeometry({ scene: 'test-scene', records: [floor, pipe] });
  assert.equal(disconnected.findings.length, 1);
  assert.equal(disconnected.findings[0].kind, GEOMETRY_FINDING_KINDS.FLOATING);
  assert.equal(disconnected.findings[0].gapM, GEOMETRY_THRESHOLDS.floatGapM + 0.000001);

  const ownerId = 'lab/pipe-assembly';
  const ownBracket = box(
    'lab/pipe-bracket',
    { minX: -1, maxX: 0 },
    { ownerId, overlap: false, supports: true },
  );
  const ownPipe = box(
    'lab/pipe-owned',
    { minX: GEOMETRY_THRESHOLDS.floatGapM, maxX: 1 },
    { ownerId, checkSupport: true },
  );
  const sameOwner = scanGeometry({ scene: 'test-scene', records: [ownBracket, ownPipe] });
  assert.equal(sameOwner.findings[0].kind, GEOMETRY_FINDING_KINDS.FLOATING);
  assert.equal(sameOwner.findings[0].gapM, null);
});

test('support ownership does not suppress overlap and blocks self-support', () => {
  const supportOwnerId = 'fixture/support-assembly';
  const first = box('fixture/part-a', {}, { supportOwnerId });
  const second = box('fixture/part-b', {}, { supportOwnerId });
  const overlapScan = scanGeometry({ scene: 'test-scene', records: [first, second] });
  assert.equal(overlapScan.findings[0].kind, GEOMETRY_FINDING_KINDS.INTERPENETRATION);

  const ownAnchor = box(
    'fixture/own-anchor',
    { minX: -1, maxX: 0 },
    { supportOwnerId, overlap: false, supports: true, fixedSupportAnchor: true },
  );
  const ownObject = box(
    'fixture/own-object',
    { minX: GEOMETRY_THRESHOLDS.floatGapM, maxX: 1 },
    { supportOwnerId, overlap: false, checkSupport: true },
  );
  const supportScan = scanGeometry({ scene: 'test-scene', records: [ownAnchor, ownObject] });
  assert.equal(supportScan.findings[0].kind, GEOMETRY_FINDING_KINDS.FLOATING);
  assert.equal(supportScan.findings[0].gapM, null);
});

test('same-owner mesh and collider pairs are suppressed', () => {
  const result = scanGeometry({
    scene: 'test-scene',
    records: [
      box('chair/mesh', {}, { ownerId: 'chair' }),
      box('chair/collider', {}, { ownerId: 'chair' }),
    ],
  });
  assert.equal(result.candidatePairCount, 1);
  assert.deepEqual(result.findings, []);
});

test('overlap layers separate visual and collider comparisons but not support', () => {
  const mesh = box('chair/mesh', {}, { overlapLayer: 'visual' });
  const ownCollider = box(
    'chair/own-collider',
    {},
    { ownerId: 'chair', overlapLayer: 'collider' },
  );
  const ownedMesh = { ...mesh, ownerId: 'chair' };
  const foreignCollider = box('crate/collider', {}, { overlapLayer: 'collider' });

  assert.deepEqual(
    scanGeometry({ scene: 'test-scene', records: [ownedMesh, ownCollider] }).findings,
    [],
  );
  assert.deepEqual(
    scanGeometry({ scene: 'test-scene', records: [mesh, foreignCollider] }).findings,
    [],
  );

  const colliderCollision = scanGeometry({
    scene: 'test-scene',
    records: [
      box('chair/collider', {}, { overlapLayer: 'collider' }),
      box('crate/collider', {}, { overlapLayer: 'collider' }),
    ],
  });
  assert.equal(colliderCollision.findings[0].kind, GEOMETRY_FINDING_KINDS.INTERPENETRATION);

  const meshCollision = scanGeometry({
    scene: 'test-scene',
    records: [
      box('chair/mesh', {}, { overlapLayer: 'visual' }),
      box('crate/mesh', {}, { overlapLayer: 'visual' }),
    ],
  });
  assert.equal(meshCollision.findings[0].kind, GEOMETRY_FINDING_KINDS.INTERPENETRATION);

  const colliderSupport = box(
    'floor/collider',
    { minX: -1, minY: -1, minZ: -1, maxX: 2, maxY: 0, maxZ: 2 },
    { overlap: false, overlapLayer: 'collider', supports: true },
  );
  const visualObject = box(
    'chair/visual',
    { minY: GEOMETRY_THRESHOLDS.floatGapM, maxY: 1 },
    { checkSupport: true, overlapLayer: 'visual' },
  );
  assert.deepEqual(
    scanGeometry({ scene: 'test-scene', records: [colliderSupport, visualObject] }).findings,
    [],
  );
});

test('finding IDs and order are deterministic across input order', () => {
  const records = [
    box('z-object'),
    box('a-object'),
    box('middle-object'),
  ];
  const forward = scanGeometry({ scene: 'test-scene', state: 'late', records });
  const reverse = scanGeometry({ scene: 'test-scene', state: 'late', records: [...records].reverse() });

  assert.deepEqual(forward.findings, reverse.findings);
  assert.deepEqual(
    forward.findings.map((finding) => finding.id),
    [...forward.findings.map((finding) => finding.id)].sort(),
  );
  assert.equal(forward.findings[0].id.startsWith('test-scene|late|'), true);
});

test('a valid exact allowlist match passes at its pinned cap', () => {
  const scan = scanGeometry({
    scene: 'test-scene',
    records: [box('range'), box('surround', { maxX: 0.05 })],
  });
  const allowlist = emptyAllowlist();
  allowlist.entries.push(pairEntry(scan.findings[0]));

  allowlist.entries[0].sourceAnchor = 'fitted range';
  const normalized = validateGeometryAllowlist(allowlist, { scene: 'test-scene', scans: [scan] });
  assert.equal(normalized.entries[0].sourceAnchor, 'fitted range');
  const result = reconcileGeometryAllowlist({ scene: 'test-scene', scans: [scan], allowlist: normalized });
  assert.equal(result.ok, true);
  assert.equal(result.allowed.length, 1);
  assert.deepEqual(result.violations, []);
});

test('unlisted findings and growth beyond a pinned cap fail reconciliation', () => {
  const scan = scanGeometry({
    scene: 'test-scene',
    records: [box('range'), box('surround', { maxX: 0.05 })],
  });
  const unlisted = reconcileGeometryAllowlist({
    scene: 'test-scene',
    scans: [scan],
    allowlist: emptyAllowlist(),
  });
  assert.equal(unlisted.ok, false);
  assert.equal(unlisted.violations[0].code, 'UNLISTED');

  const allowlist = emptyAllowlist();
  allowlist.entries.push(pairEntry(scan.findings[0], { maxDepthM: 0.04 }));
  const grown = reconcileGeometryAllowlist({ scene: 'test-scene', scans: [scan], allowlist });
  assert.equal(grown.ok, false);
  assert.equal(grown.violations[0].code, 'CAP_EXCEEDED');
  assert.equal(grown.violations[0].actualM, 0.05);
});

test('no-support floating findings cannot be hidden behind a numeric cap', () => {
  const scan = scanGeometry({
    scene: 'test-scene',
    records: [box('lab/coolant-pipe', { minY: 5, maxY: 6 }, { checkSupport: true })],
  });
  const allowlist = emptyAllowlist();
  allowlist.entries.push(floatingEntry(scan.findings[0]));

  const result = reconcileGeometryAllowlist({ scene: 'test-scene', scans: [scan], allowlist });
  assert.equal(result.ok, false);
  assert.equal(result.violations[0].code, 'UNBOUNDED_FINDING');
  assert.equal(result.violations[0].actualM, null);
});

test('fixed geometry makes its exact allowlist entry stale', () => {
  const scan = scanGeometry({
    scene: 'test-scene',
    records: [box('range'), box('surround', { minX: 2, maxX: 3 })],
  });
  const allowlist = emptyAllowlist();
  allowlist.entries.push({
    id: 'old-range-join',
    state: 'default',
    kind: GEOMETRY_FINDING_KINDS.INTERPENETRATION,
    left: 'range',
    right: 'surround',
    maxDepthM: 0.05,
    reason: 'The range formerly keyed into its fitted cabinet surround.',
    source: 'src/scenes/test-scene.js:42',
  });

  assert.throws(
    () => reconcileGeometryAllowlist({ scene: 'test-scene', scans: [scan], allowlist }),
    (error) => issueCodes(error).includes('STALE_ENTRY'),
  );
});

test('strict v1 allowlist rejects duplicate, ambiguous, unknown, wildcard, and noncanonical policy', () => {
  const scan = scanGeometry({
    scene: 'test-scene',
    records: [box('range'), box('surround', { maxX: 0.05 })],
  });
  const valid = pairEntry(scan.findings[0]);
  const cases = [
    ['DUPLICATE_ENTRY_ID', [valid, { ...valid }]],
    ['AMBIGUOUS_ALLOWLIST', [valid, { ...valid, id: 'second-range-join' }]],
    ['UNKNOWN_STATE', [{ ...valid, state: 'unknown-state' }]],
    ['UNKNOWN_OBJECT', [{ ...valid, right: 'unknown-object' }]],
    ['UNKNOWN_KIND', [{ ...valid, kind: 'ANY_OVERLAP' }]],
    ['UNKNOWN_KEY', [{ ...valid, expires: 'tomorrow' }]],
    ['WILDCARD_SELECTOR', [{ ...valid, right: 'surround*' }]],
    ['NONCANONICAL_PAIR', [{ ...valid, left: valid.right, right: valid.left }]],
    ['INVALID_REASON', [{ ...valid, reason: 'TODO' }]],
    ['INVALID_SOURCE', [{ ...valid, source: 'C:\\scene.js' }]],
    ['INVALID_CAP', [{ ...valid, maxDepthM: GEOMETRY_THRESHOLDS.overlapM }]],
    ['UNKNOWN_SCHEMA', [{ ...valid }], { $schema: 'geometry.v2' }],
  ];

  for (const [expectedCode, entries, topOverrides = {}] of cases) {
    const allowlist = { ...emptyAllowlist(), ...topOverrides, entries };
    assert.throws(
      () => validateGeometryAllowlist(allowlist, { scene: 'test-scene', scans: [scan] }),
      (error) => issueCodes(error).includes(expectedCode),
      expectedCode,
    );
  }

  const outOfOrder = emptyAllowlist();
  outOfOrder.entries = [
    { ...valid, id: 'z-entry' },
    { ...valid, id: 'a-entry', kind: GEOMETRY_FINDING_KINDS.WALL_EMBED },
  ];
  assert.throws(
    () => validateGeometryAllowlist(outOfOrder, { scene: 'test-scene', scans: [scan] }),
    (error) => issueCodes(error).includes('NONCANONICAL_ENTRY_ORDER'),
  );
});

test('suppression policy requires exact canonical per-state counts and source scopes', () => {
  const scan = scanGeometry({ scene: 'test-scene', records: [box('only-record')] });
  const sourcePolicy = {
    sourceId: 'root:test/name=small-fixture#0',
    scope: 'direct',
    overlap: 1,
    checkSupport: 0,
  };
  const valid = emptyAllowlist();
  valid.suppressionPolicy[0] = {
    state: 'default',
    overlap: 1,
    checkSupport: 0,
    sources: [sourcePolicy],
  };
  const normalized = validateGeometryAllowlist(valid, { scene: 'test-scene', scans: [scan] });
  assert.deepEqual(normalized.suppressionPolicy, valid.suppressionPolicy);

  const missingPolicy = { ...valid };
  delete missingPolicy.suppressionPolicy;
  const cases = [
    ['MISSING_KEY', missingPolicy],
    ['MISSING_SUPPRESSION_STATE', { ...valid, suppressionPolicy: [] }],
    ['SUPPRESSION_COUNT_MISMATCH', {
      ...valid,
      suppressionPolicy: [{ ...valid.suppressionPolicy[0], overlap: 2 }],
    }],
    ['INVALID_SUPPRESSION_SCOPE', {
      ...valid,
      suppressionPolicy: [{
        ...valid.suppressionPolicy[0],
        sources: [{ ...sourcePolicy, scope: 'scene-wide' }],
      }],
    }],
    ['DUPLICATE_SUPPRESSION_SOURCE', {
      ...valid,
      suppressionPolicy: [{
        ...valid.suppressionPolicy[0],
        overlap: 2,
        sources: [sourcePolicy, { ...sourcePolicy }],
      }],
    }],
  ];
  for (const [expectedCode, allowlist] of cases) {
    assert.throws(
      () => validateGeometryAllowlist(allowlist, { scene: 'test-scene', scans: [scan] }),
      (error) => issueCodes(error).includes(expectedCode),
      expectedCode,
    );
  }

  const invalidAnchor = emptyAllowlist();
  invalidAnchor.entries.push(pairEntry({
    state: 'default',
    kind: GEOMETRY_FINDING_KINDS.INTERPENETRATION,
    left: 'only-record',
    right: 'other-record',
    depthM: 0.05,
  }, { sourceAnchor: ' x ' }));
  assert.throws(
    () => validateGeometryAllowlist(invalidAnchor, { scene: 'test-scene', scans: [scan] }),
    (error) => issueCodes(error).includes('INVALID_SOURCE_ANCHOR'),
  );
});

test('duplicate current selectors fail closed as ambiguous findings', () => {
  const scan = scanGeometry({
    scene: 'test-scene',
    records: [box('range'), box('surround', { maxX: 0.05 })],
  });
  const finding = scan.findings[0];
  const ambiguousScan = {
    ...scan,
    findings: [finding, { ...finding, id: `${finding.id}|duplicate` }],
  };
  const allowlist = emptyAllowlist();
  allowlist.entries.push(pairEntry(finding));

  assert.throws(
    () => reconcileGeometryAllowlist({ scene: 'test-scene', scans: [ambiguousScan], allowlist }),
    (error) => issueCodes(error).includes('AMBIGUOUS_FINDING'),
  );
});

test('runGeometryGate sorts scene states and violations deterministically', () => {
  const result = runGeometryGate({
    scene: 'test-scene',
    states: [
      { state: 'z-finale', records: [box('z-one'), box('z-two')] },
      { state: 'a-entry', records: [box('a-one'), box('a-two')] },
    ],
    allowlist: emptyAllowlist('test-scene', ['a-entry', 'z-finale']),
  });

  assert.deepEqual(result.scans.map((scan) => scan.state), ['a-entry', 'z-finale']);
  assert.equal(result.ok, false);
  assert.deepEqual(
    result.violations.map(({ finding }) => finding.id),
    [...result.violations.map(({ finding }) => finding.id)].sort(),
  );
});
