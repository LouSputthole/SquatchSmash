import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../vendor/three.module.min.js';

import {
  GEOMETRY_GATE_DEGENERATE_HALF_EXTENT,
  GEOMETRY_GATE_HIDDEN_INSTANCE_MAX_SCALE,
  collectGeometrySnapshot,
} from '../tools/geometry-collect.mjs';
import { ensureDomShim } from '../tools/three-shim.mjs';

function box(name, size = [1, 1, 1]) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    new THREE.MeshBasicMaterial(),
  );
  mesh.name = name;
  return mesh;
}

function buildStableFixture() {
  const scene = new THREE.Scene();
  scene.name = 'runtime-scene-name-is-not-the-root-id';

  const west = new THREE.Group();
  west.name = 'suite';
  west.userData.geometryGate = { assemblyId: 'suite-west', fixedSupportAnchor: true };
  const westChair = box('chair');
  westChair.position.set(-4, 0.5, 0);
  westChair.userData.geometryGate = { role: 'prop', checkSupport: false };
  west.add(westChair);

  const east = new THREE.Group();
  east.name = 'suite';
  east.userData.geometryGateAssemblyId = 'suite-east';
  const eastChair = box('chair');
  eastChair.position.set(4, 0.5, 0);
  east.add(eastChair);

  const seats = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial(),
    2,
  );
  seats.name = 'theatre-seat';
  seats.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 0.5, 2));
  seats.setMatrixAt(1, new THREE.Matrix4().makeTranslation(3, 0.5, 2));
  scene.add(west, east, seats);

  const floor = box('main-floor', [12, 0.2, 8]);
  floor.position.y = -0.1;
  scene.add(floor);

  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 3),
    new THREE.MeshBasicMaterial(),
  );
  wall.name = 'basement-wall-panel-south';
  wall.userData.geometryGate = { wall: true, wallAxis: 'z' };
  wall.position.y = 1.5;
  scene.add(wall);

  const wallGroup = new THREE.Group();
  wallGroup.name = 'service-wall';
  const unnamedWallPanel = box('');
  wallGroup.add(unnamedWallPanel);
  scene.add(wallGroup);

  const skipped = box('dynamic-actor');
  scene.add(skipped);

  const hiddenGroup = new THREE.Group();
  hiddenGroup.visible = false;
  hiddenGroup.add(box('hidden-crate'));
  scene.add(hiddenGroup);

  scene.add(box('weapon-muzzle-flash'));
  return scene;
}

test('headless collector emits deterministic semantic records for rendered meshes and instances', () => {
  const observedByFilter = [];
  const collect = (root) => collectGeometrySnapshot({
    THREE,
    roots: [{ label: 'mansion', root }],
    includeObject: (_object, context) => {
      observedByFilter.push(context.name);
      return context.name !== 'dynamic-actor';
    },
  });
  const first = collect(buildStableFixture());
  observedByFilter.length = 0;
  const second = collect(buildStableFixture());

  assert.equal(first.counted, 7);
  assert.deepEqual(first.collectionErrors, []);
  assert.deepEqual(first, second, 'runtime UUIDs must not affect the snapshot');
  assert.equal(new Set(first.items.map(({ id }) => id)).size, first.items.length);
  assert.equal(JSON.stringify(first).includes('uuid'), false);
  assert.deepEqual(observedByFilter.sort(), [
    'basement-wall-panel-south',
    'chair',
    'chair',
    'dynamic-actor',
    'main-floor',
    'theatre-seat',
    '',
  ].sort(), 'hidden and VFX objects stay outside the optional filter seam');

  const chairs = first.items.filter(({ name }) => name === 'chair');
  assert.equal(chairs.length, 2);
  assert.notEqual(chairs[0].id, chairs[1].id, 'repeated sibling names need unique paths');
  assert.match(chairs[0].id, /name=suite#0\/name=chair#0$/);
  assert.match(chairs[1].id, /name=suite#1\/name=chair#0$/);
  assert.equal(chairs[0].parentId, chairs[0].nearestNamedGroupId);
  assert.match(chairs[0].assemblyId, /assembly:suite-west$/);
  assert.equal(chairs[0].ownerId, chairs[0].assemblyId);
  assert.equal(chairs[0].role, 'prop');
  assert.equal(chairs[0].checkSupport, false);
  assert.equal(chairs[0].fixedSupportAnchor, true, 'anchor policy is inherited from parents');
  assert.equal(chairs[1].fixedSupportAnchor, false);

  const instances = first.items.filter(({ name }) => name === 'theatre-seat');
  assert.deepEqual(instances.map(({ instanceIndex }) => instanceIndex), [0, 1]);
  assert.deepEqual(instances.map(({ min, max }) => [min.x, max.x]), [
    [-0.5, 0.5],
    [2.5, 3.5],
  ]);
  assert.notEqual(instances[0].ownerId, instances[1].ownerId);

  const floor = first.items.find(({ name }) => name === 'main-floor');
  assert.equal(floor.structural, true);
  assert.equal(floor.wall, false);
  assert.equal(floor.fixedSupportAnchor, true, 'structural visuals are fixed anchors by default');
  const wall = first.items.find(({ name }) => name === 'basement-wall-panel-south');
  assert.equal(wall.wall, true);
  assert.equal(wall.wallAxis, 'z', 'authored thin-axis policy must cross the collector seam');
  assert.equal(wall.structural, false);
  assert.equal(wall.fixedSupportAnchor, true, 'walls are fixed anchors by default');
  assert.equal(wall.size.z, GEOMETRY_GATE_DEGENERATE_HALF_EXTENT * 2);
  assert.equal(wall.min.z, -GEOMETRY_GATE_DEGENERATE_HALF_EXTENT);
  assert.equal(wall.max.z, GEOMETRY_GATE_DEGENERATE_HALF_EXTENT);
  const inheritedWall = first.items.find(({ nearestNamedGroupId }) => (
    nearestNamedGroupId?.includes('name=service-wall')
  ));
  assert.equal(inheritedWall.wall, true, 'named wall groups pass wall semantics to unnamed meshes');
  for (const item of first.items) {
    for (const vector of [item.min, item.max, item.size]) {
      assert.equal(Object.getPrototypeOf(vector), Object.prototype);
      assert.ok(Object.values(vector).every(Number.isFinite));
    }
    assert.ok(Object.values(item.size).every((value) => value > 0));
  }
});

test('label sorting makes IDs independent of labelled-root input order', () => {
  const alpha = new THREE.Scene();
  alpha.add(box('crate'));
  const beta = new THREE.Scene();
  beta.add(box('crate'));

  const forward = collectGeometrySnapshot({
    THREE,
    roots: [{ label: 'alpha', root: alpha }, { label: 'beta', root: beta }],
  });
  const reverse = collectGeometrySnapshot({
    THREE,
    roots: [{ label: 'beta', root: beta }, { label: 'alpha', root: alpha }],
  });
  assert.deepEqual(forward, reverse);
  assert.deepEqual(forward.items.map(({ id }) => id), [
    'root:alpha/name=crate#0',
    'root:beta/name=crate#0',
  ]);
});

test('instance assembly prefixes share corresponding owners across batches without joining indices', () => {
  const scene = new THREE.Scene();
  const nestedMetadata = new THREE.Group();
  nestedMetadata.name = 'left-bank';
  nestedMetadata.userData.geometryGate = { instanceAssemblyPrefix: 'recliner/seat' };
  const legacyMetadata = new THREE.Group();
  legacyMetadata.name = 'right-bank';
  legacyMetadata.userData.geometryGateInstanceAssemblyPrefix = 'recliner/seat';

  const makeBatch = (name, x) => {
    const batch = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
      2,
    );
    batch.name = name;
    batch.setMatrixAt(0, new THREE.Matrix4().makeTranslation(x, 0.5, 0));
    batch.setMatrixAt(1, new THREE.Matrix4().makeTranslation(x, 0.5, 2));
    return batch;
  };
  nestedMetadata.add(makeBatch('seat-shell', -2));
  legacyMetadata.add(makeBatch('seat-collider', 2));

  const explicit = makeBatch('explicit-owner', 6);
  explicit.userData.geometryGate = {
    assemblyId: 'fixed-owner',
    instanceAssemblyPrefix: 'ignored-prefix',
  };
  scene.add(nestedMetadata, legacyMetadata, explicit);

  const snapshot = collectGeometrySnapshot({
    THREE,
    roots: [{ label: 'theatre', root: scene }],
  });
  assert.deepEqual(snapshot.collectionErrors, []);
  const shells = snapshot.items.filter(({ name }) => name === 'seat-shell');
  const colliders = snapshot.items.filter(({ name }) => name === 'seat-collider');
  assert.deepEqual(shells.map(({ assemblyId }) => assemblyId), [
    'root:theatre/assembly:recliner%2Fseat-0',
    'root:theatre/assembly:recliner%2Fseat-1',
  ]);
  assert.deepEqual(
    shells.map(({ ownerId }) => ownerId),
    colliders.map(({ ownerId }) => ownerId),
    'corresponding instance indices form one logical owner across separate batches',
  );
  assert.notEqual(shells[0].ownerId, shells[1].ownerId, 'different indices stay isolated');
  const explicitItems = snapshot.items.filter(({ name }) => name === 'explicit-owner');
  assert.deepEqual(explicitItems.map(({ ownerId }) => ownerId), [
    'root:theatre/assembly:fixed-owner',
    'root:theatre/assembly:fixed-owner',
  ], 'ordinary explicit assemblyId keeps precedence');
});

test('support assembly IDs normalize independently from collision ownership and fail closed', () => {
  const scene = new THREE.Scene();
  const seatedFixture = new THREE.Group();
  seatedFixture.name = 'seated-fixture';
  seatedFixture.userData.geometryGate = {
    assemblyId: 'date-booth',
    supportAssemblyId: 'date-furniture',
  };
  seatedFixture.add(box('chair'), box('table'));

  const malformed = box('malformed-support-owner');
  malformed.userData.geometryGate = { supportAssemblyId: '   ' };
  scene.add(seatedFixture, malformed, box('regular-support-sibling'));

  const snapshot = collectGeometrySnapshot({
    THREE,
    roots: [{ label: 'silver', root: scene }],
  });
  const fixtureParts = snapshot.items.filter(({ name }) => ['chair', 'table'].includes(name));
  assert.deepEqual(fixtureParts.map(({ assemblyId }) => assemblyId), [
    'root:silver/assembly:date-booth',
    'root:silver/assembly:date-booth',
  ]);
  assert.deepEqual(fixtureParts.map(({ supportAssemblyId }) => supportAssemblyId), [
    'root:silver/support-assembly:date-furniture',
    'root:silver/support-assembly:date-furniture',
  ]);
  assert.ok(snapshot.items.some(({ name }) => name === 'regular-support-sibling'));
  assert.ok(!snapshot.items.some(({ name }) => name === 'malformed-support-owner'));
  assert.deepEqual(snapshot.collectionErrors.map(({ code, name }) => [code, name]), [
    ['mesh_metadata', 'malformed-support-owner'],
  ]);
  assert.match(snapshot.collectionErrors[0].error, /supportAssemblyId.*stable non-empty string/);
});

test('instance assembly ID arrays preserve heterogeneous logical owners across batches', () => {
  const scene = new THREE.Scene();
  const landmarkIds = ['civic/hall', 'civic/hall', 'station', 'station'];
  const makeBatch = (name, x) => {
    const batch = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
      landmarkIds.length,
    );
    batch.name = name;
    batch.userData.geometryGate = { instanceAssemblyIds: [...landmarkIds] };
    landmarkIds.forEach((_, index) => {
      batch.setMatrixAt(index, new THREE.Matrix4().makeTranslation(x, 0.5, index * 2));
    });
    return batch;
  };
  scene.add(makeBatch('landmark-shell', -2), makeBatch('landmark-detail', 2));

  const snapshot = collectGeometrySnapshot({
    THREE,
    roots: [{ label: 'city', root: scene }],
  });
  assert.deepEqual(snapshot.collectionErrors, []);
  const shells = snapshot.items.filter(({ name }) => name === 'landmark-shell');
  const details = snapshot.items.filter(({ name }) => name === 'landmark-detail');
  assert.deepEqual(shells.map(({ ownerId }) => ownerId), [
    'root:city/assembly:civic%2Fhall',
    'root:city/assembly:civic%2Fhall',
    'root:city/assembly:station',
    'root:city/assembly:station',
  ]);
  assert.deepEqual(
    details.map(({ ownerId }) => ownerId),
    shells.map(({ ownerId }) => ownerId),
    'the same landmark keeps one owner across heterogeneous shape/finish batches',
  );
  assert.ok(
    snapshot.items.every((item) => !Object.hasOwn(item, 'instanceAssemblyIds')),
    'the source array is not duplicated into every serialized instance record',
  );
});

test('invalid instance assembly ID arrays fail closed without hiding regular siblings', () => {
  const scene = new THREE.Scene();
  const makeBatch = (name, geometryGate, count = 2) => {
    const batch = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
      count,
    );
    batch.name = name;
    batch.userData.geometryGate = geometryGate;
    return batch;
  };
  scene.add(
    makeBatch('ids-not-array', { instanceAssemblyIds: 'landmark' }),
    makeBatch('ids-wrong-length', { instanceAssemblyIds: ['one'] }),
    makeBatch('ids-blank', { instanceAssemblyIds: ['one', '   '] }),
    makeBatch('ids-prefix-conflict', {
      instanceAssemblyIds: ['one', 'two'],
      instanceAssemblyPrefix: 'legacy',
    }),
    makeBatch('ids-assembly-conflict', {
      assemblyId: 'whole-batch',
      instanceAssemblyIds: ['one', 'two'],
    }),
  );
  const ordinaryMesh = box('ids-on-mesh');
  ordinaryMesh.userData.geometryGate = { instanceAssemblyIds: ['one'] };
  scene.add(ordinaryMesh, box('regular-sibling'));

  const snapshot = collectGeometrySnapshot({
    THREE,
    roots: [{ label: 'strict-instance-owners', root: scene }],
  });
  assert.deepEqual(snapshot.items.map(({ name }) => name), ['regular-sibling']);
  assert.equal(snapshot.collectionErrors.length, 6);
  assert.ok(snapshot.collectionErrors.every(({ code }) => code === 'mesh_metadata'));
  const errors = new Map(snapshot.collectionErrors.map(({ name, error }) => [name, error]));
  assert.match(errors.get('ids-not-array'), /must be an array/);
  assert.match(errors.get('ids-wrong-length'), /length 1 must equal InstancedMesh count 2/);
  assert.match(errors.get('ids-blank'), /instanceAssemblyIds\[1\].*non-empty string/);
  assert.match(errors.get('ids-prefix-conflict'), /cannot be combined/);
  assert.match(errors.get('ids-assembly-conflict'), /cannot be combined/);
  assert.match(errors.get('ids-on-mesh'), /only valid on an InstancedMesh/);
});

test('invalid instance assembly prefixes are collection errors without hiding regular siblings', () => {
  const scene = new THREE.Scene();
  const group = new THREE.Group();
  group.userData.geometryGate = { instanceAssemblyPrefix: '   ' };
  const batch = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial(),
    1,
  );
  batch.name = 'invalid-prefix-batch';
  group.add(batch, box('regular-sibling'));
  scene.add(group);

  const snapshot = collectGeometrySnapshot({
    THREE,
    roots: [{ label: 'theatre', root: scene }],
  });
  assert.deepEqual(snapshot.items.map(({ name }) => name), ['regular-sibling']);
  assert.deepEqual(snapshot.collectionErrors.map(({ code, name }) => [code, name]), [
    ['mesh_metadata', 'invalid-prefix-batch'],
  ]);
  assert.match(snapshot.collectionErrors[0].error, /stable non-empty string/i);
});

test("effectively hidden instance sentinels are omitted without hiding small or non-uniform geometry", () => {
  const scene = new THREE.Scene();
  const batch = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial(),
    6,
  );
  batch.name = "visibility-sentinel-batch";
  const compose = (x, scale) => new THREE.Matrix4().compose(
    new THREE.Vector3(x, 0.5, 0),
    new THREE.Quaternion(),
    new THREE.Vector3(...scale),
  );
  const tiny = GEOMETRY_GATE_HIDDEN_INSTANCE_MAX_SCALE;
  batch.setMatrixAt(0, compose(0, [tiny, tiny, tiny]));
  batch.setMatrixAt(1, compose(1, [tiny * 1.01, tiny * 1.01, tiny * 1.01]));
  batch.setMatrixAt(2, compose(2, [tiny * 0.5, tiny * 0.5, 0.25]));
  batch.setMatrixAt(3, compose(3, [tiny * 0.5, tiny * 0.5, tiny * 0.5]));
  batch.setMatrixAt(4, compose(4, [-tiny, tiny, tiny]));
  const malformed = compose(5, [tiny * 0.5, tiny * 0.5, tiny * 0.5]);
  malformed.elements[12] = Number.NaN;
  batch.setMatrixAt(5, malformed);
  scene.add(batch, box("visible-sibling"));

  const snapshot = collectGeometrySnapshot({
    THREE,
    roots: [{ label: "visibility", root: scene }],
  });

  assert.deepEqual(snapshot.items.map(({ name, instanceIndex }) => [name, instanceIndex]), [
    ["visibility-sentinel-batch", 1],
    ["visibility-sentinel-batch", 2],
    ["visible-sibling", null],
  ]);
  assert.deepEqual(snapshot.collectionErrors.map(({ code, instanceIndex }) => [code, instanceIndex]), [
    ["mesh_world_bounds", 5],
  ]);
  assert.match(snapshot.collectionErrors[0].error, /non-finite instance matrix/i);
});

test('one invalid instance or include filter does not erase valid sibling geometry', () => {
  const scene = new THREE.Scene();
  const batch = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial(),
    2,
  );
  batch.name = 'mixed-transform-batch';
  batch.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 0.5, 0));
  batch.setMatrixAt(1, new THREE.Matrix4().makeTranslation(Number.NaN, 0, 0));
  scene.add(batch, box('bad-filter'), box('survivor'));

  const snapshot = collectGeometrySnapshot({
    THREE,
    roots: [{ label: 'lab', root: scene }],
    includeObject: (_object, { name }) => {
      if (name === 'bad-filter') throw new Error('filter refused this object');
      return true;
    },
  });
  assert.deepEqual(snapshot.items.map(({ name, instanceIndex }) => [name, instanceIndex]), [
    ['mixed-transform-batch', 0],
    ['survivor', null],
  ]);
  assert.deepEqual(snapshot.collectionErrors.map(({ code, name, instanceIndex }) => (
    [code, name, instanceIndex]
  )), [
    ['include_object', 'bad-filter', null],
    ['mesh_world_bounds', 'mixed-transform-batch', 1],
  ]);
  assert.match(snapshot.collectionErrors[1].error, /non-finite instance matrix/i);
});

test('normalized colliders require stable names or tags and preserve explicit ownership', () => {
  const scene = new THREE.Scene();
  const fixture = box('coolant-pipe');
  fixture.userData.geometryGate = { assemblyId: 'coolant-line-1' };
  scene.add(fixture);

  const snapshot = collectGeometrySnapshot({
    THREE,
    roots: [{ label: 'lab', root: scene }],
    colliders: [
      { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
      {
        tag: 'coolant-line-collider',
        assemblyId: 'coolant-line-1',
        min: { x: -0.5, y: -0.5, z: 0 },
        max: { x: 0.5, y: 0.5, z: 0 },
      },
      {
        id: 'non-finite',
        min: { x: 0, y: 0, z: 0 },
        max: { x: Number.NaN, y: 1, z: 1 },
      },
      {
        id: 'duplicate',
        min: { x: 0, y: 0, z: 0 },
        max: { x: 1, y: 1, z: 1 },
      },
      {
        id: 'duplicate',
        min: { x: 2, y: 0, z: 0 },
        max: { x: 3, y: 1, z: 1 },
      },
    ],
  });

  assert.equal(snapshot.colliders.length, 1);
  const collider = snapshot.colliders[0];
  const mesh = snapshot.items[0];
  assert.equal(collider.id, 'root:lab/collider:coolant-line-collider');
  assert.equal(collider.ownerId, mesh.ownerId);
  assert.equal(collider.fixedSupportAnchor, true, 'colliders are fixed anchors by default');
  assert.equal(collider.size.z, GEOMETRY_GATE_DEGENERATE_HALF_EXTENT * 2);
  assert.ok(Object.values(collider.min).every(Number.isFinite));
  assert.deepEqual(snapshot.collectionErrors.map(({ code }) => code), [
    'collider',
    'collider',
    'duplicate_collider_id',
  ]);
  const unnamed = snapshot.collectionErrors.find(({ error }) => /stable string id/i.test(error));
  assert.ok(unnamed);
  assert.equal(unnamed.semanticPath, null);
  assert.doesNotMatch(unnamed.error, /index|\[\d+\]/i);
});

test('geometryGate metadata requires a known-key plain object without hiding siblings', () => {
  const scene = new THREE.Scene();
  const stringPolicy = box('string-policy');
  stringPolicy.userData.geometryGate = 'checkSupport=false';
  const arrayPolicy = box('array-policy');
  arrayPolicy.userData.geometryGate = [];
  const misspelledPolicy = box('misspelled-policy');
  misspelledPolicy.userData.geometryGate = { chekSupport: false };
  const valid = box('valid-sibling');
  valid.userData.geometryGate = { checkSupport: false };
  scene.add(stringPolicy, arrayPolicy, misspelledPolicy, valid);

  const snapshot = collectGeometrySnapshot({
    THREE,
    roots: [{ label: 'strict-metadata', root: scene }],
  });

  assert.deepEqual(snapshot.items.map(({ name }) => name), ['valid-sibling']);
  assert.deepEqual(snapshot.collectionErrors.map(({ code }) => code), [
    'mesh_metadata',
    'mesh_metadata',
    'mesh_metadata',
  ]);
  assert.equal(
    snapshot.collectionErrors.filter(({ error }) => /plain object/.test(error)).length,
    2,
  );
  assert.ok(snapshot.collectionErrors.some(({ error }) => /unknown key.*chekSupport/.test(error)));
});

test('collector records exact provenance for direct and inherited authored suppressions', () => {
  const scene = new THREE.Scene();
  const boundedFixture = new THREE.Group();
  boundedFixture.name = 'bounded-fixture';
  boundedFixture.userData.geometryGate = { checkSupport: false };
  const inherited = box('inherited-panel');
  boundedFixture.add(inherited);

  const direct = box('direct-panel');
  direct.userData.geometryGate = { overlap: false };
  const directProperty = box('direct-property');
  directProperty.overlap = false;

  const instances = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial(),
    2,
  );
  instances.name = 'direct-instances';
  instances.userData.geometryGate = { overlap: false };
  instances.setMatrixAt(0, new THREE.Matrix4().makeTranslation(2, 0, 0));
  instances.setMatrixAt(1, new THREE.Matrix4().makeTranslation(4, 0, 0));
  scene.add(boundedFixture, direct, directProperty, instances);

  const snapshot = collectGeometrySnapshot({
    THREE,
    roots: [{ label: 'policy', root: scene }],
  });
  assert.deepEqual(snapshot.collectionErrors, []);
  const byName = (name) => snapshot.items.filter((item) => item.name === name);
  assert.deepEqual(byName('inherited-panel')[0].suppressionProvenance, {
    checkSupport: {
      sourceId: 'root:policy/name=bounded-fixture#0',
      scope: 'inherited',
      origin: 'userData.geometryGate.checkSupport',
    },
  });
  assert.deepEqual(byName('direct-panel')[0].suppressionProvenance, {
    overlap: {
      sourceId: 'root:policy/name=direct-panel#0',
      scope: 'direct',
      origin: 'userData.geometryGate.overlap',
    },
  });
  assert.equal(byName('direct-property')[0].overlap, false);
  assert.deepEqual(byName('direct-property')[0].suppressionProvenance, {
    overlap: {
      sourceId: 'root:policy/name=direct-property#0',
      scope: 'direct',
      origin: 'object.overlap',
    },
  });
  assert.deepEqual(
    byName('direct-instances').map(({ suppressionProvenance }) => suppressionProvenance),
    [0, 1].map(() => ({
      overlap: {
        sourceId: 'root:policy/name=direct-instances#0',
        scope: 'direct',
        origin: 'userData.geometryGate.overlap',
      },
    })),
    'direct metadata on the exact InstancedMesh remains permitted and attributable',
  );
});

test('exact collider opt-outs carry direct provenance without counting collider defaults', () => {
  const scene = new THREE.Scene();
  scene.add(box('visible-fixture'));
  const snapshot = collectGeometrySnapshot({
    THREE,
    roots: [{ label: 'collider-policy', root: scene }],
    colliders: [
      {
        id: 'ordinary-blocker',
        min: { x: 0, y: 0, z: 0 },
        max: { x: 1, y: 1, z: 1 },
      },
      {
        id: 'exact-optout',
        overlap: false,
        min: { x: 2, y: 0, z: 0 },
        max: { x: 3, y: 1, z: 1 },
      },
    ],
  });
  const ordinary = snapshot.colliders.find(({ name }) => name === 'ordinary-blocker');
  const optedOut = snapshot.colliders.find(({ name }) => name === 'exact-optout');
  assert.equal(ordinary.suppressionProvenance, undefined);
  assert.deepEqual(optedOut.suppressionProvenance, {
    overlap: {
      sourceId: 'root:collider-policy/collider:exact-optout',
      scope: 'direct',
      origin: 'object.overlap',
    },
  });
});

test('malformed authored booleans and wall axes fail closed without hiding valid siblings', () => {
  const scene = new THREE.Scene();
  const badBoolean = box('bad-boolean');
  badBoolean.userData.geometryGate = { fixedSupportAnchor: 'yes' };
  const badAxis = box('bad-axis');
  badAxis.userData.geometryGate = { wall: true, wallAxis: 'y' };
  const axisOnProp = box('axis-on-prop');
  axisOnProp.userData.geometryGate = { wall: false, wallAxis: 'x' };
  scene.add(badBoolean, badAxis, axisOnProp, box('valid-sibling'));

  const snapshot = collectGeometrySnapshot({
    THREE,
    roots: [{ label: 'strict-policy', root: scene }],
  });

  assert.deepEqual(snapshot.items.map(({ name }) => name), ['valid-sibling']);
  assert.deepEqual(snapshot.collectionErrors.map(({ code }) => code), [
    'mesh_metadata',
    'mesh_metadata',
    'mesh_metadata',
  ]);
  assert.ok(snapshot.collectionErrors.some(({ error }) => /must be a boolean/.test(error)));
  assert.ok(snapshot.collectionErrors.some(({ error }) => /must be "x" or "z"/.test(error)));
  assert.ok(snapshot.collectionErrors.some(({ error }) => /only valid on a wall/.test(error)));
});

test('collider bounds reject null and numeric-string coercion', () => {
  const scene = new THREE.Scene();
  scene.add(box('valid-mesh'));
  const snapshot = collectGeometrySnapshot({
    THREE,
    roots: [{ label: 'strict-bounds', root: scene }],
    colliders: [
      {
        id: 'null-coordinate',
        min: { x: null, y: 0, z: 0 },
        max: { x: 1, y: 1, z: 1 },
      },
      {
        id: 'numeric-string',
        min: { x: '0', y: 0, z: 0 },
        max: { x: 1, y: 1, z: 1 },
      },
      {
        id: 'valid-collider',
        min: { x: 0, y: 0, z: 0 },
        max: { x: 1, y: 1, z: 1 },
      },
    ],
  });

  assert.deepEqual(snapshot.colliders.map(({ name }) => name), ['valid-collider']);
  assert.deepEqual(snapshot.collectionErrors.map(({ code }) => code), ['collider', 'collider']);
  assert.ok(snapshot.collectionErrors.every(({ error }) => /non-finite x bounds/.test(error)));
});

test('duplicate root labels fail closed instead of assigning order-dependent IDs', () => {
  const left = new THREE.Scene();
  left.add(box('left'));
  const right = new THREE.Scene();
  right.add(box('right'));
  const snapshot = collectGeometrySnapshot({
    THREE,
    roots: [{ label: 'same', root: left }, { label: 'same', root: right }],
  });
  assert.deepEqual(snapshot.items, []);
  assert.deepEqual(snapshot.collectionErrors.map(({ code }) => code), ['duplicate_root_label']);
});

test('shared DOM shim exposes correctly sized image buffers for headless scene builders', () => {
  const context = ensureDomShim().createElement('canvas').getContext('2d');
  const image = context.createImageData(7, 5);
  assert.equal(image.width, 7);
  assert.equal(image.height, 5);
  assert.equal(image.data.length, 7 * 5 * 4);
  assert.ok(image.data instanceof Uint8ClampedArray);
});
