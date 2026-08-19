import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GEOMETRY_FINDING_KINDS,
  geometryRecordsFromSnapshot,
  scanGeometry,
} from '../tools/geometry-gate.mjs';
import { buildGeometrySceneState, withExclusiveGeometryBuild } from '../tools/geometry-scenes.mjs';
import {
  GEOMETRY_GATE_HIDDEN_INSTANCE_MAX_SCALE,
  collectGeometrySnapshot,
} from '../tools/geometry-collect.mjs';
import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';
import {
  applyScenePolicy,
  normalizeSceneColliders,
  summarizeSuppressionPolicy,
  withDescriptorGeometryRandom,
} from '../tools/verify-geometry-worker.mjs';

ensureThreeShim();
ensureDomShim();

test('descriptor PRNG boundaries are stable and restore Math.random on success and failure', async () => {
  const originalRandom = Math.random;
  const sample = async (id) => withDescriptorGeometryRandom(id, async () => {
    const first = Math.random();
    await Promise.resolve();
    return [first, Math.random(), Math.random()];
  });

  const first = await sample('bing:visit-one');
  assert.equal(Math.random, originalRandom);
  assert.deepEqual(await sample('bing:visit-one'), first);
  assert.notDeepEqual(await sample('bing:visit-two'), first);
  await assert.rejects(
    () => withDescriptorGeometryRandom('bing:visit-one', async () => {
      Math.random();
      throw new Error('builder failed');
    }),
    /builder failed/,
  );
  assert.equal(Math.random, originalRandom);
});

test('direct headless builds use one FIFO and keep concurrent Adapter summaries stable', async () => {
  const events = [];
  const firstSlot = withExclusiveGeometryBuild(async () => {
    events.push('first:start');
    await Promise.resolve();
    events.push('first:end');
  });
  const secondSlot = withExclusiveGeometryBuild(async () => {
    events.push('second:start');
    events.push('second:end');
  });
  await Promise.all([firstSlot, secondSlot]);
  assert.deepEqual(events, ['first:start', 'first:end', 'second:start', 'second:end']);

  const summarize = async () => {
    const [silver, bing] = await Promise.all([
      buildGeometrySceneState('silver:default'),
      buildGeometrySceneState('bing:visit-one'),
    ]);
    return JSON.stringify({
      silver: {
        producerCounts: silver.metadata.producerCounts,
        castIds: silver.metadata.castIds,
      },
      bing: {
        castCount: bing.metadata.castCount,
        familyCount: bing.metadata.familyCount,
        seatedActorCount: bing.metadata.seatedActorCount,
        occupiedFixtureCount: bing.metadata.occupiedFixtureCount,
        lotVehicleCount: bing.metadata.lotVehicleCount,
      },
    });
  };

  const first = await summarize();
  const second = await summarize();
  assert.equal(second, first);
  assert.equal(JSON.parse(first).silver.producerCounts.cast, 67);
});

test("worker pipeline excludes hidden Enola destruction sentinels from policy records", async () => {
  const id = "enolasquatch:detonation";
  const built = await withDescriptorGeometryRandom(id, () => buildGeometrySceneState(id));
  const snapshot = collectGeometrySnapshot({
    roots: built.roots,
    colliders: normalizeSceneColliders(built),
    THREE: built.THREE,
  });
  assert.deepEqual(snapshot.collectionErrors, []);

  let hiddenCount = 0;
  const matrix = new built.THREE.Matrix4();
  const position = new built.THREE.Vector3();
  const rotation = new built.THREE.Quaternion();
  const scale = new built.THREE.Vector3();
  const city = built.roots[0].root.getObjectByName("squatchbourg");
  for (const name of [
    "squatchbourg-buildings",
    "squatchbourg-trees",
    "squatchbourg-rolling-stock",
    "squatchbourg-river-craft",
  ]) {
    const batch = city.getObjectByName(name);
    assert.ok(batch?.isInstancedMesh, name + " must be present in the detonation build");
    let visibleCount = 0;
    for (let index = 0; index < batch.count; index += 1) {
      batch.getMatrixAt(index, matrix);
      matrix.decompose(position, rotation, scale);
      const hidden = ["x", "y", "z"].every((axis) => (
        Math.abs(scale[axis]) <= Math.fround(GEOMETRY_GATE_HIDDEN_INSTANCE_MAX_SCALE)
      ));
      if (hidden) hiddenCount += 1;
      else visibleCount += 1;
    }
    assert.equal(
      snapshot.items.filter((item) => item.name === name).length,
      visibleCount,
      name + " must emit one record per visible instance",
    );
  }
  assert.ok(hiddenCount > 100, "the checkpoint must exercise the destruction sentinel path");
  const policyRecords = geometryRecordsFromSnapshot(applyScenePolicy(snapshot));
  assert.ok(policyRecords.every((record) => (
    !record.id.includes("/instance:")
    || !(record.name ?? "").startsWith("squatchbourg-")
    || snapshot.items.some((item) => item.id === record.id)
  )));
});

function box(id, min, max, overrides = {}) {
  return {
    id,
    semanticPath: id,
    ownerId: id,
    assemblyId: null,
    nearestNamedGroupId: null,
    name: id.split('/').at(-1),
    rootLabel: 'palace',
    min,
    max,
    structural: false,
    wall: false,
    overlap: true,
    supports: true,
    ...overrides,
  };
}

test('transient collider ownership links only its exact rendered source', () => {
  const authoredOwner = 'root:palace/name=service-gate#0';
  const outsideOwner = 'root:palace/name=outside-fixture#0';
  const transientAssembly = 'root:palace/assembly:collider-service-gate';
  const sourceId = `${authoredOwner}/name=gate-panel#0`;
  const joinedId = `${authoredOwner}/name=gate-hinge#0`;
  const colliderId = 'root:palace/collider:service-gate';
  const outsideId = `${outsideOwner}/name=outside-bracket#0`;
  const snapshot = {
    counted: 2,
    collectionErrors: [],
    items: [
      box(sourceId, { x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 1 }, {
        assemblyId: transientAssembly,
        ownerId: transientAssembly,
        nearestNamedGroupId: authoredOwner,
      }),
      box(joinedId, { x: 1.5, y: 0, z: 0 }, { x: 2.5, y: 2, z: 1 }, {
        nearestNamedGroupId: authoredOwner,
      }),
    ],
    colliders: [
      box(colliderId, { x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 1 }, {
        kind: 'collider',
        assemblyId: transientAssembly,
        ownerId: transientAssembly,
      }),
      box(outsideId, { x: 1.75, y: 0, z: 0 }, { x: 3, y: 2, z: 1 }, {
        kind: 'collider',
        ownerId: outsideOwner,
      }),
    ],
  };

  const adapted = applyScenePolicy(snapshot);
  const source = adapted.items.find(({ id }) => id === sourceId);
  const joined = adapted.items.find(({ id }) => id === joinedId);
  const collider = adapted.colliders.find(({ id }) => id === colliderId);
  assert.equal(source.ownerId, transientAssembly);
  assert.equal(joined.ownerId, authoredOwner);
  assert.equal(collider.ownerId, transientAssembly);
  assert.equal(source.assemblyId, transientAssembly);
  assert.equal(collider.assemblyId, transientAssembly);

  const records = geometryRecordsFromSnapshot(adapted);
  const ownerById = new Map(records.map(({ id, ownerId }) => [id, ownerId]));
  assert.equal(ownerById.get(sourceId), transientAssembly);
  assert.equal(ownerById.get(joinedId), authoredOwner);
  assert.equal(ownerById.get(colliderId), transientAssembly);

  const scan = scanGeometry({ scene: 'palace', state: 'closed', records });
  assert.ok(
    scan.findings.some(({ left, right }) => (
      (left === sourceId && right === joinedId) || (left === joinedId && right === sourceId)
    )),
    'an implicit named group must not suppress overlap between unowned mesh parts',
  );
  assert.ok(
    scan.findings.some(({ left, right }) => (
      (left === colliderId && right === outsideId)
      || (left === outsideId && right === colliderId)
    )),
    'the remapped collider must still be audited against geometry outside its authored owner',
  );
});

test('foliage names cannot bypass overlap checks and explicit policy remains exact', () => {
  const frondId = 'root:palace/name=palm-frond#0';
  const frondOutsideId = 'root:palace/name=frond-outside#0';
  const explicitFrondId = 'root:palace/name=hero-frond#0';
  const explicitOutsideId = 'root:palace/name=hero-frond-outside#0';
  const pipeOwner = 'root:palace/name=foliage-services#0';
  const pipeId = `${pipeOwner}/name=coolant-pipe#0`;
  const pipeOutsideId = 'root:palace/name=pipe-outside#0';
  const treeId = 'root:palace/name=generic-tree#0';
  const adapted = applyScenePolicy({
    counted: 7,
    collectionErrors: [],
    items: [
      box(frondId, { x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 1 }, {
        name: 'palm-frond',
        overlap: undefined,
        supports: undefined,
      }),
      box(frondOutsideId, { x: 1, y: 0, z: 0 }, { x: 3, y: 2, z: 1 }, {
        name: 'stone-bracket',
      }),
      box(explicitFrondId, { x: 10, y: 0, z: 0 }, { x: 12, y: 2, z: 1 }, {
        name: 'hero-frond',
        overlap: true,
      }),
      box(explicitOutsideId, { x: 11, y: 0, z: 0 }, { x: 13, y: 2, z: 1 }, {
        name: 'hero-bracket',
      }),
      box(pipeId, { x: 20, y: 0, z: 0 }, { x: 22, y: 2, z: 1 }, {
        name: 'coolant-pipe',
        nearestNamedGroupId: pipeOwner,
        overlap: undefined,
      }),
      box(pipeOutsideId, { x: 21, y: 0, z: 0 }, { x: 23, y: 2, z: 1 }, {
        name: 'pipe-bracket',
      }),
      box(treeId, { x: 30, y: 0, z: 0 }, { x: 32, y: 2, z: 1 }, {
        name: 'generic-tree',
        overlap: undefined,
      }),
    ],
    colliders: [],
  });

  const byId = new Map(adapted.items.map((item) => [item.id, item]));
  assert.equal(byId.get(frondId).overlap, true);
  assert.equal(byId.get(frondId).supports, true);
  assert.equal(byId.get(explicitFrondId).overlap, true);
  assert.equal(byId.get(pipeId).overlap, true, 'foliage ancestry must not exempt a pipe');
  assert.equal(byId.get(treeId).overlap, true, 'generic tree names are not porous-foliage tokens');

  const records = geometryRecordsFromSnapshot(adapted);
  const scan = scanGeometry({ scene: 'palace', state: 'closed', records });
  const hasInterpenetration = (first, second) => scan.findings.some(({ kind, left, right }) => (
    kind === GEOMETRY_FINDING_KINDS.INTERPENETRATION
    && ((left === first && right === second) || (left === second && right === first))
  ));
  assert.equal(
    hasInterpenetration(frondId, frondOutsideId),
    true,
    'a foliage-like name is not an implicit geometry waiver',
  );
  assert.equal(
    hasInterpenetration(explicitFrondId, explicitOutsideId),
    true,
    'explicit overlap=true must opt a frond back into overlap checks',
  );
  assert.equal(
    hasInterpenetration(pipeId, pipeOutsideId),
    true,
    'pipes must remain overlap-audited',
  );
});

test('structural meshes support assemblies without producing overlap noise by default', () => {
  const floorId = 'root:palace/name=main-floor#0';
  const crateOwner = 'root:palace/name=crate#0';
  const crateId = `${crateOwner}/name=crate-body#0`;
  const explicitStructuralId = 'root:palace/name=explicit-structural#0';
  const outsideOwner = 'root:palace/name=outside-prop#0';
  const outsideId = `${outsideOwner}/name=outside-body#0`;
  const adapted = applyScenePolicy({
    counted: 4,
    collectionErrors: [],
    items: [
      box(floorId, { x: -5, y: -0.2, z: -5 }, { x: 5, y: 0, z: 5 }, {
        structural: true,
        overlap: undefined,
        supports: undefined,
      }),
      box(crateId, { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }, {
        nearestNamedGroupId: crateOwner,
        overlap: undefined,
      }),
      box(
        explicitStructuralId,
        { x: 20, y: 0, z: 0 },
        { x: 21, y: 1, z: 1 },
        { structural: true, overlap: true },
      ),
      box(outsideId, { x: 20.5, y: 0, z: 0 }, { x: 21.5, y: 1, z: 1 }, {
        nearestNamedGroupId: outsideOwner,
      }),
    ],
    colliders: [],
  });

  const floor = adapted.items.find(({ id }) => id === floorId);
  const crate = adapted.items.find(({ id }) => id === crateId);
  const explicitStructural = adapted.items.find(({ id }) => id === explicitStructuralId);
  const crateEnvelope = adapted.items.find(({ kind, supportOwnerId }) => (
    kind === 'assembly-envelope' && supportOwnerId === crateOwner
  ));
  assert.equal(floor.overlap, false);
  assert.equal(floor.supports, true);
  assert.equal(floor.fixedSupportAnchor, true);
  assert.equal(crate.overlap, true);
  assert.equal(crate.fixedSupportAnchor, false);
  assert.equal(crateEnvelope.fixedSupportAnchor, false, 'support envelopes are never fixed anchors');
  assert.equal(explicitStructural.overlap, true, 'explicit structural overlap must override the default');

  const records = geometryRecordsFromSnapshot(adapted);
  const scan = scanGeometry({ scene: 'palace', state: 'closed', records });
  assert.equal(
    scan.findings.some(({ left, right }) => (
      (left === floorId && right === crateId) || (left === crateId && right === floorId)
    )),
    false,
    'structural support must not create a penetration finding',
  );
  assert.equal(
    scan.findings.some(({ kind, object }) => (
      kind === GEOMETRY_FINDING_KINDS.FLOATING
      && object === crateEnvelope.id
    )),
    false,
    'overlap-disabled structural geometry must still support the crate assembly',
  );
  assert.ok(
    scan.findings.some(({ kind, left, right }) => (
      kind === GEOMETRY_FINDING_KINDS.INTERPENETRATION
      && ((left === explicitStructuralId && right === outsideId)
        || (left === outsideId && right === explicitStructuralId))
    )),
    'explicit overlap=true must keep structural geometry in penetration checks',
  );
});

test('mixed support components inherit a real fixed anchor without fixing disconnected peers', () => {
  const supportAssemblyId = 'root:siege/support-assembly:lower-slab-component';
  const adapted = applyScenePolicy({
    counted: 3,
    collectionErrors: [],
    items: [
      box('root:siege/name=lower-slab#0', { x: 0, y: -0.2, z: 0 }, { x: 2, y: 0, z: 2 }, {
        rootLabel: 'siege', supportAssemblyId, structural: true,
      }),
      box('root:siege/name=lower-floor#0', { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }, {
        rootLabel: 'siege', supportAssemblyId,
      }),
      box('root:siege/name=loose-platform#0', { x: 3, y: 2, z: 0 }, { x: 4, y: 3, z: 1 }, {
        rootLabel: 'siege', supportAssemblyId,
      }),
    ],
    colliders: [],
  });
  const envelopes = adapted.items.filter(({ kind }) => kind === 'assembly-envelope');
  assert.equal(envelopes.length, 2, 'disconnected support members keep separate envelopes');
  const anchored = envelopes.filter(({ fixedSupportAnchor }) => fixedSupportAnchor);
  const unanchored = envelopes.filter(({ fixedSupportAnchor }) => !fixedSupportAnchor);
  assert.equal(anchored.length, 1, 'the component containing the structural slab keeps its fixed anchor');
  assert.equal(unanchored.length, 1, 'an unrelated component is not fixed by sharing only an authored ID');

  const scan = scanGeometry({
    scene: 'siege', state: 'lower-floor', records: geometryRecordsFromSnapshot(adapted),
  });
  assert.equal(scan.findings.some(({ kind, object }) => (
    kind === GEOMETRY_FINDING_KINDS.FLOATING && object === anchored[0].id
  )), false, 'the structurally anchored mixed component cannot float');
  assert.equal(scan.findings.some(({ kind, object }) => (
    kind === GEOMETRY_FINDING_KINDS.FLOATING && object === unanchored[0].id
  )), true, 'the disconnected component remains support-audited');
});

test('normalized scene colliders are overlap-audited by default with an explicit opt-out', () => {
  const collider = (id, minX, maxX, overlap = undefined) => ({
    id,
    min: { x: minX, y: 0, z: 0 },
    max: { x: maxX, y: 2, z: 1 },
    ...(overlap === undefined ? {} : { overlap }),
  });
  const defaultA = collider('default-a', 0, 2);
  const defaultB = collider('default-b', 1, 3);
  const explicitA = collider('explicit-a', 10, 12);
  explicitA.userData = { geometryGate: { overlap: false } };
  const explicitB = collider('explicit-b', 11, 13);
  const normalized = normalizeSceneColliders({
    scene: 'siege',
    roots: [{ label: 'siege', root: { traverse() {} } }],
    colliders: [defaultA, defaultB, explicitA, explicitB],
  });
  const byId = new Map(normalized.map((item) => [item.id, item]));

  assert.equal(byId.get('default-a').overlap, true);
  assert.equal(byId.get('default-b').overlap, true);
  assert.equal(byId.get('explicit-a').overlap, false);
  assert.equal(byId.get('explicit-b').overlap, true);
  assert.ok(normalized.every(({ supports }) => supports === true));
  assert.ok(normalized.every(({ fixedSupportAnchor }) => fixedSupportAnchor === true));

  const adapted = applyScenePolicy({
    counted: 0,
    collectionErrors: [],
    items: [],
    colliders: normalized,
  });
  const scan = scanGeometry({
    scene: 'siege',
    state: 'clean',
    records: geometryRecordsFromSnapshot(adapted),
  });
  const hasInterpenetration = (first, second) => scan.findings.some(({ kind, left, right }) => (
    kind === GEOMETRY_FINDING_KINDS.INTERPENETRATION
    && ((left === first && right === second) || (left === second && right === first))
  ));
  assert.equal(
    hasInterpenetration('default-a', 'default-b'),
    true,
    'ordinary collision volumes must be audited against other collision volumes',
  );
  assert.equal(
    hasInterpenetration('explicit-a', 'explicit-b'),
    false,
    'a narrow explicit overlap=false policy can waive a known blocker join',
  );
});

test('named hierarchy forms physical support components without collision ownership', () => {
  const broadGroup = 'root:scene/name=whole-room#0';
  const legId = `${broadGroup}/name=chair-leg#0`;
  const seatId = `${broadGroup}/name=chair-seat#0`;
  const floatingId = `${broadGroup}/name=floating-crate#0`;
  const floorId = 'root:scene/name=floor#0';
  const adapted = applyScenePolicy({
    counted: 4,
    collectionErrors: [],
    items: [
      box(floorId, { x: -2, y: -0.2, z: -2 }, { x: 12, y: 0, z: 2 }, {
        structural: true,
      }),
      box(legId, { x: 0, y: 0, z: 0 }, { x: 0.2, y: 0.8, z: 0.2 }, {
        nearestNamedGroupId: broadGroup,
      }),
      box(seatId, { x: 0, y: 0.8, z: 0 }, { x: 1, y: 1, z: 1 }, {
        nearestNamedGroupId: broadGroup,
      }),
      box(floatingId, { x: 10, y: 2, z: 0 }, { x: 11, y: 3, z: 1 }, {
        nearestNamedGroupId: broadGroup,
      }),
    ],
    colliders: [],
  });
  const members = new Map(adapted.items.map((item) => [item.id, item]));
  assert.equal(members.get(legId).ownerId, legId);
  assert.equal(members.get(seatId).ownerId, seatId);
  assert.equal(members.get(legId).supportOwnerId, broadGroup);
  assert.equal(members.get(seatId).supportOwnerId, broadGroup);
  const envelopes = adapted.items.filter(({ kind }) => kind === 'assembly-envelope');
  assert.equal(envelopes.length, 2, 'the distant crate must not union with the chair component');

  const records = geometryRecordsFromSnapshot(adapted);
  const scan = scanGeometry({ scene: 'policy', state: 'components', records });
  const floatingEnvelope = envelopes.find(({ min }) => min.x === 10);
  assert.ok(floatingEnvelope);
  assert.ok(scan.findings.some(({ kind, object }) => (
    kind === GEOMETRY_FINDING_KINDS.FLOATING && object === floatingEnvelope.id
  )));
});

test('legacy collider normalization rejects null and numeric-string coordinates', () => {
  const normalized = normalizeSceneColliders({
    scene: 'strict-bounds',
    roots: [{ label: 'strict-bounds', root: { traverse() {} } }],
    colliders: [
      { id: 'null-coordinate', x0: null, x1: 1, z0: 0, z1: 1 },
      { id: 'numeric-string', x0: '0', x1: 1, z0: 0, z1: 1 },
      { id: 'valid-coordinate', x0: 0, x1: 1, z0: 0, z1: 1 },
    ],
  });

  assert.deepEqual(normalized.slice(0, 2), [
    { id: 'invalid-collider', invalid: 'unsupported collider bounds' },
    { id: 'invalid-collider', invalid: 'unsupported collider bounds' },
  ]);
  assert.equal(normalized[2].id, 'valid-coordinate');
  assert.deepEqual(normalized[2].min, { x: 0, y: -0.5, z: 0 });
  assert.deepEqual(normalized[2].max, { x: 1, y: 4, z: 1 });
});

test('collider normalization preserves nested and legacy explicit assemblies', () => {
  const nestedMesh = { isObject3D: true, userData: {} };
  const legacyMesh = { isObject3D: true, userData: {} };
  const transientMesh = { isObject3D: true, userData: {} };
  const bounds = (id, mesh, userData = {}) => ({
    id,
    mesh,
    userData,
    min: { x: 0, y: 0, z: 0 },
    max: { x: 1, y: 1, z: 1 },
  });
  const normalized = normalizeSceneColliders({
    scene: 'lab',
    roots: [{ label: 'lab', root: { traverse() {} } }],
    colliders: [
      bounds('nested', nestedMesh, { geometryGate: { assemblyId: 'fitted-range' } }),
      bounds('legacy', legacyMesh, { geometryGateAssemblyId: 'legacy-services' }),
      bounds('transient', transientMesh),
    ],
  });

  assert.deepEqual(
    normalized.map(({ id, assemblyId }) => [id, assemblyId]),
    [
      ['nested', 'fitted-range'],
      ['legacy', 'legacy-services'],
      ['transient', 'collider-transient'],
    ],
  );
  assert.equal(nestedMesh.userData.geometryGate.assemblyId, 'fitted-range');
  assert.equal(legacyMesh.userData.geometryGate.assemblyId, 'legacy-services');
  assert.equal(transientMesh.userData.geometryGate.assemblyId, 'collider-transient');
});

test('scene-scale inherited suppressions fail while exact direct metadata stays attributable', () => {
  const beefRoot = 'root:beef-route';
  const inherited = Array.from({ length: 65 }, (_, index) => box(
    `${beefRoot}/name=route-part#${index}`,
    { x: index / 100, y: 0, z: 0 },
    { x: 1 + index / 100, y: 1, z: 1 },
    {
      checkSupport: false,
      suppressionProvenance: {
        checkSupport: {
          sourceId: beefRoot,
          scope: 'inherited',
          origin: 'userData.geometryGate.checkSupport',
        },
      },
    },
  ));
  assert.throws(
    () => summarizeSuppressionPolicy(inherited),
    /SCENE_SCALE_SUPPRESSION.*<=64 parts.*65 parts/,
  );

  const wideRoot = 'root:beef-route/name=airstrip#0';
  const wide = [0, 9].map((x, index) => box(
    `${wideRoot}/name=terrain#${index}`,
    { x, y: 0, z: 0 },
    { x: x + 1, y: 1, z: 1 },
    {
      overlap: false,
      suppressionProvenance: {
        overlap: {
          sourceId: wideRoot,
          scope: 'inherited',
          origin: 'userData.geometryGate.overlap',
        },
      },
    },
  ));
  assert.throws(
    () => summarizeSuppressionPolicy(wide),
    /SCENE_SCALE_SUPPRESSION.*<=8m.*10.000x1.000x1.000m/,
  );

  const instancedSource = 'root:beef-route/name=marker-batch#0';
  const direct = Array.from({ length: 65 }, (_, index) => box(
    `${instancedSource}/instance:${index}`,
    { x: index / 100, y: 0, z: 0 },
    { x: 1 + index / 100, y: 1, z: 1 },
    {
      objectPath: instancedSource,
      overlap: false,
      suppressionProvenance: {
        overlap: {
          sourceId: instancedSource,
          scope: 'direct',
          origin: 'userData.geometryGate.overlap',
        },
      },
    },
  ));
  const directSummary = summarizeSuppressionPolicy(direct);
  assert.equal(directSummary.overlap, 65);
  assert.deepEqual(directSummary.sources, [{
    sourceId: instancedSource,
    scope: 'direct',
    overlap: 65,
    checkSupport: 0,
    origins: ['userData.geometryGate.overlap'],
  }]);
});

test('bounded suppression reports are deterministic by field and exact source scope', () => {
  const sourceId = 'root:palace/name=small-fixture#0';
  const items = [
    box(`${sourceId}/name=b#0`, { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }, {
      overlap: false,
      suppressionProvenance: {
        overlap: {
          sourceId,
          scope: 'inherited',
          origin: 'userData.geometryGate.overlap',
        },
      },
    }),
    box(`${sourceId}/name=a#0`, { x: 1, y: 0, z: 0 }, { x: 2, y: 1, z: 1 }, {
      checkSupport: false,
      suppressionProvenance: {
        checkSupport: {
          sourceId,
          scope: 'inherited',
          origin: 'userData.geometryGate.checkSupport',
        },
      },
    }),
  ];
  const expected = {
    overlap: 1,
    checkSupport: 1,
    total: 2,
    sources: [{
      sourceId,
      scope: 'inherited',
      overlap: 1,
      checkSupport: 1,
      origins: [
        'userData.geometryGate.checkSupport',
        'userData.geometryGate.overlap',
      ],
    }],
  };
  assert.deepEqual(summarizeSuppressionPolicy(items), expected);
  assert.deepEqual(summarizeSuppressionPolicy([...items].reverse()), expected);
  assert.deepEqual(applyScenePolicy({
    counted: items.length,
    collectionErrors: [],
    items,
    colliders: [],
  }).suppressions, expected);
});

test('suppression summaries use locale-independent canonical source order', () => {
  const sourceZ = 'root:enolasquatch-detonation/name=Z#0';
  const sourceUnderscore = 'root:enolasquatch-detonation/name=_#0';
  const suppressed = (sourceId, x) => box(
    sourceId,
    { x, y: 0, z: 0 },
    { x: x + 1, y: 1, z: 1 },
    {
      overlap: false,
      suppressionProvenance: {
        overlap: {
          sourceId,
          scope: 'direct',
          origin: 'userData.geometryGate.overlap',
        },
      },
    },
  );

  const summary = summarizeSuppressionPolicy([
    suppressed(sourceUnderscore, 2),
    suppressed(sourceZ, 0),
  ]);
  assert.deepEqual(
    summary.sources.map(({ sourceId }) => sourceId),
    [sourceZ, sourceUnderscore],
  );
});

test('only bounded local parent or named objects imply collision ownership', () => {
  const rootId = 'root:palace';
  const chairId = `${rootId}/name=chair#0`;
  const broadId = `${rootId}/name=room-container#0`;
  const nestedId = `${rootId}/name=room#0/name=table#0`;
  const wideId = `${rootId}/name=room#0/name=wide-structure#0`;
  const chairParts = [
    box(`${chairId}/name=seat#0`, { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }, {
      parentId: chairId,
    }),
    box(`${chairId}/name=back#0`, { x: 0.5, y: 0, z: 0 }, { x: 1.5, y: 1, z: 1 }, {
      parentId: chairId,
    }),
  ];
  const rootParts = [
    box(`${rootId}/name=loose-a#0`, { x: 10, y: 0, z: 0 }, { x: 11, y: 1, z: 1 }, {
      parentId: rootId,
    }),
    box(`${rootId}/name=loose-b#0`, { x: 10.5, y: 0, z: 0 }, { x: 11.5, y: 1, z: 1 }, {
      parentId: rootId,
    }),
  ];
  const nestedParts = [
    box(`${nestedId}/name=top#0`, { x: 15, y: 0, z: 0 }, { x: 16, y: 1, z: 1 }, {
      parentId: `${nestedId}/type=Group#0`,
      nearestNamedGroupId: nestedId,
    }),
    box(`${nestedId}/name=base#0`, { x: 15.5, y: 0, z: 0 }, { x: 16.5, y: 1, z: 1 }, {
      parentId: `${nestedId}/type=Group#1`,
      nearestNamedGroupId: nestedId,
    }),
  ];
  const wideParts = [
    box(`${wideId}/name=left#0`, { x: 30, y: 0, z: 0 }, { x: 31, y: 1, z: 1 }, {
      parentId: rootId,
      nearestNamedGroupId: wideId,
    }),
    box(`${wideId}/name=right#0`, { x: 39, y: 0, z: 0 }, { x: 40, y: 1, z: 1 }, {
      parentId: rootId,
      nearestNamedGroupId: wideId,
    }),
  ];
  const broadParts = Array.from({ length: 65 }, (_, index) => box(
    `${broadId}/name=part#${index}`,
    { x: 20 + index * 0.001, y: 0, z: 0 },
    { x: 21 + index * 0.001, y: 1, z: 1 },
    { parentId: broadId },
  ));
  const adapted = applyScenePolicy({
    counted: chairParts.length + rootParts.length + nestedParts.length
      + wideParts.length + broadParts.length,
    collectionErrors: [],
    items: [...chairParts, ...rootParts, ...nestedParts, ...wideParts, ...broadParts],
    colliders: [],
  });
  const byId = new Map(adapted.items.map((item) => [item.id, item]));
  assert.equal(byId.get(chairParts[0].id).ownerId, chairId);
  assert.equal(byId.get(chairParts[1].id).ownerId, chairId);
  assert.equal(byId.get(rootParts[0].id).ownerId, rootParts[0].id);
  assert.equal(byId.get(rootParts[1].id).ownerId, rootParts[1].id);
  assert.equal(byId.get(nestedParts[0].id).ownerId, nestedId);
  assert.equal(byId.get(nestedParts[1].id).ownerId, nestedId);
  assert.equal(byId.get(wideParts[0].id).ownerId, wideParts[0].id);
  assert.equal(byId.get(wideParts[1].id).ownerId, wideParts[1].id);
  assert.equal(byId.get(broadParts[0].id).ownerId, broadParts[0].id);
  assert.equal(byId.get(broadParts[1].id).ownerId, broadParts[1].id);

  const scan = scanGeometry({
    scene: 'palace',
    state: 'owner-policy',
    records: geometryRecordsFromSnapshot(adapted),
  });
  const hasPair = (left, right) => scan.findings.some((finding) => (
    (finding.left === left && finding.right === right)
    || (finding.left === right && finding.right === left)
  ));
  assert.equal(hasPair(chairParts[0].id, chairParts[1].id), false);
  assert.equal(hasPair(rootParts[0].id, rootParts[1].id), true);
  assert.equal(hasPair(broadParts[0].id, broadParts[1].id), true);
});

test('authored support assemblies split floating groups without changing collision ownership', () => {
  const collisionOwner = 'root:silver/assembly:date-booth';
  const furnitureSupport = 'root:silver/support-assembly:date-furniture';
  const occupantSupport = 'root:silver/support-assembly:date-occupant';
  const chairBase = box(
    'root:silver/name=chair-base#0',
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0.4, z: 1 },
    { assemblyId: collisionOwner, supportAssemblyId: furnitureSupport },
  );
  const chairSeat = box(
    'root:silver/name=chair-seat#0',
    { x: 0, y: 0.4, z: 0 },
    { x: 1, y: 1, z: 1 },
    { assemblyId: collisionOwner, supportAssemblyId: furnitureSupport },
  );
  const occupant = box(
    'root:silver/name=date-occupant#0',
    { x: 0.1, y: -0.2, z: 0.1 },
    { x: 0.9, y: 1.8, z: 0.9 },
    {
      assemblyId: collisionOwner,
      supportAssemblyId: occupantSupport,
      checkSupport: false,
    },
  );
  const adapted = applyScenePolicy({
    counted: 3,
    collectionErrors: [],
    items: [chairBase, chairSeat, occupant],
    colliders: [],
  });
  const members = new Map(adapted.items.map((item) => [item.id, item]));
  for (const item of [chairBase, chairSeat, occupant]) {
    assert.equal(members.get(item.id).ownerId, collisionOwner);
  }
  assert.equal(members.get(chairBase.id).supportOwnerId, furnitureSupport);
  assert.equal(members.get(chairSeat.id).supportOwnerId, furnitureSupport);
  assert.equal(members.get(occupant.id).supportOwnerId, occupantSupport);
  const envelopes = adapted.items.filter(({ kind }) => kind === 'assembly-envelope');
  assert.equal(envelopes.length, 1, 'furniture keeps one envelope while the occupant opts out alone');
  assert.equal(envelopes[0].supportOwnerId, furnitureSupport);

  const scan = scanGeometry({
    scene: 'silver',
    state: 'date',
    records: geometryRecordsFromSnapshot(adapted),
  });
  assert.ok(!scan.findings.some(({ kind }) => kind === GEOMETRY_FINDING_KINDS.INTERPENETRATION));
});

test('support assemblies are bounded and disconnected parts keep separate envelopes', () => {
  const supportAssemblyId = 'root:palace/support-assembly:bounded-fixture';
  const disconnected = [0, 3].map((x, index) => box(
    `root:palace/name=fixture-part#${index}`,
    { x, y: 0, z: 0 },
    { x: x + 1, y: 1, z: 1 },
    { supportAssemblyId },
  ));
  const adapted = applyScenePolicy({
    counted: disconnected.length,
    collectionErrors: [],
    items: disconnected,
    colliders: [],
  });
  assert.equal(
    adapted.items.filter(({ kind }) => kind === 'assembly-envelope').length,
    2,
    'one authored ID does not bridge physically disconnected components',
  );

  const tooMany = Array.from({ length: 65 }, (_, index) => box(
    `root:palace/name=dense-part#${index}`,
    { x: index / 1000, y: 0, z: 0 },
    { x: 1 + index / 1000, y: 1, z: 1 },
    { supportAssemblyId: 'root:palace/support-assembly:too-many' },
  ));
  assert.throws(
    () => applyScenePolicy({ items: tooMany, colliders: [], collectionErrors: [] }),
    /SCENE_SCALE_SUPPORT_ASSEMBLY.*<=64 parts.*65 parts/,
  );

  const tooWide = [0, 9].map((x, index) => box(
    `root:palace/name=wide-part#${index}`,
    { x, y: 0, z: 0 },
    { x: x + 1, y: 1, z: 1 },
    { supportAssemblyId: 'root:palace/support-assembly:too-wide' },
  ));
  assert.throws(
    () => applyScenePolicy({ items: tooWide, colliders: [], collectionErrors: [] }),
    /SCENE_SCALE_SUPPORT_ASSEMBLY.*<=8m.*10.000x1.000x1.000m/,
  );
});

test('scene policy preserves explicit assemblies and ungrouped collider ownership', () => {
  const explicitAssembly = 'root:palace/assembly:fitted-range';
  const orphanAssembly = 'root:palace/assembly:collider-orphan';
  const explicitId = 'root:palace/name=kitchen#0/name=range#0';
  const orphanId = 'root:palace/name=orphan-wall#0';
  const orphanColliderId = 'root:palace/collider:orphan';
  const adapted = applyScenePolicy({
    counted: 2,
    collectionErrors: [],
    items: [
      box(explicitId, { x: 10, y: 0, z: 0 }, { x: 11, y: 1, z: 1 }, {
        assemblyId: explicitAssembly,
        ownerId: explicitAssembly,
        nearestNamedGroupId: 'root:palace/name=kitchen#0',
      }),
      box(orphanId, { x: 20, y: 0, z: 0 }, { x: 21, y: 1, z: 1 }, {
        assemblyId: orphanAssembly,
        ownerId: orphanAssembly,
      }),
    ],
    colliders: [
      box(orphanColliderId, { x: 20, y: 0, z: 0 }, { x: 21, y: 1, z: 1 }, {
        kind: 'collider',
        assemblyId: orphanAssembly,
        ownerId: orphanAssembly,
      }),
    ],
  });

  const explicit = adapted.items.find(({ id }) => id === explicitId);
  const orphan = adapted.items.find(({ id }) => id === orphanId);
  const orphanCollider = adapted.colliders.find(({ id }) => id === orphanColliderId);
  assert.equal(explicit.assemblyId, explicitAssembly);
  assert.equal(explicit.ownerId, explicitAssembly);
  assert.equal(orphan.assemblyId, orphanAssembly);
  assert.equal(orphan.ownerId, orphanAssembly);
  assert.equal(orphanCollider.assemblyId, orphanAssembly);
  assert.equal(orphanCollider.ownerId, orphanAssembly);
});
