import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

import { collectGeometrySnapshot } from '../tools/geometry-collect.mjs';
import { geometryRecordsFromSnapshot, scanGeometry } from '../tools/geometry-gate.mjs';
import { buildGeometrySceneState, GEOMETRY_SCENE_STATES } from '../tools/geometry-scenes.mjs';
import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';
import { applyScenePolicy, normalizeSceneColliders } from '../tools/verify-geometry-worker.mjs';

ensureThreeShim();
ensureDomShim();

const EXPECTED_STAGES = Object.freeze({
  property: ['snow-arrival', 'lookout', 'watcher', 'clerk'],
  'late-cast': [
    'snow-exterior',
    'lookout',
    'watcher',
    'clerk',
    'rico-room',
    'chino-room',
    'slicer-room',
    'reinforcement-hook',
    'reinforcement-prod',
    'reinforcement-pistol',
  ],
});

const BUILDS = new Map();
function build(id) {
  if (!BUILDS.has(id)) BUILDS.set(id, buildGeometrySceneState(id));
  return BUILDS.get(id);
}

function objectsWhere(root, predicate) {
  const found = [];
  root.traverse((object) => { if (predicate(object)) found.push(object); });
  return found;
}

function gateAssembly(root, assemblyId) {
  return objectsWhere(root, (object) => object.userData?.geometryGate?.assemblyId === assemblyId);
}

function assertPose(actual, expected, label) {
  for (const [field, value] of Object.entries(expected)) {
    assert.ok(
      Math.abs(actual[field] - value) < 1e-9,
      `${label}.${field}: expected ${value}, found ${actual[field]}`,
    );
  }
}

test('Motel descriptors expose only the public property launcher and keep runtime states private', () => {
  const descriptors = GEOMETRY_SCENE_STATES.filter(({ scene }) => scene === 'motel');
  assert.deepEqual(
    descriptors.map(({ state, adapter, launcherIds, checkpoint, geometryStage }) => ({
      state,
      adapter,
      launcherIds,
      checkpoint,
      geometryStage,
    })),
    [
      {
        state: 'property',
        adapter: 'motel',
        launcherIds: ['motel'],
        checkpoint: undefined,
        geometryStage: 'startup',
      },
      {
        state: 'late-cast',
        adapter: 'motel',
        launcherIds: [],
        checkpoint: undefined,
        geometryStage: 'late',
      },
      {
        state: 'drive',
        adapter: 'motel',
        launcherIds: [],
        checkpoint: undefined,
        geometryStage: 'drive',
      },
    ],
  );
});

test('Motel property and late-cast adapters mount every authored actor and collider', async () => {
  const property = await build('motel:property');
  const late = await build('motel:late-cast');

  assert.equal(property.roots.length, 1);
  assert.equal(property.roots[0].root.isScene, true);
  assert.equal(late.roots.length, 1);
  assert.equal(late.roots[0].root.isScene, true);
  assert.equal(property.colliders.length, 109);
  assert.equal(late.colliders.length, 109);
  assert.equal(property.metadata.enabledColliderCount, 106);
  assert.equal(late.metadata.enabledColliderCount, 107);
  for (const [state, built] of [['property', property], ['late-cast', late]]) {
    assert.deepEqual(built.metadata.actorStages, EXPECTED_STAGES[state]);
    assert.equal(built.metadata.castCount, EXPECTED_STAGES[state].length);
    for (const collider of built.colliders) {
      assert.equal(typeof collider.name, 'string', `${state} has an unnamed collider`);
      assert.ok(collider.name, `${state} has an unnamed collider`);
      assert.equal(
        typeof collider.userData?.geometryGate?.assemblyId,
        'string',
        `${state}:${collider.name} has no stable owner`,
      );
      assert.ok(collider.userData.geometryGate.assemblyId, `${state}:${collider.name} has an empty owner`);
    }
    const actorRoots = objectsWhere(
      built.roots[0].root,
      (object) => typeof object.userData?.motelGeometryStage === 'string',
    );
    assert.deepEqual(actorRoots.map(({ userData }) => userData.motelGeometryStage), EXPECTED_STAGES[state]);
  }

  assert.equal(property.metadata.geometryStage, 'startup');
  assert.equal(property.metadata.propertyMeshCount, 810);
  assert.equal(property.metadata.arrivalCarAtPark, false);
  assertPose(property.metadata.actorPoses['snow-arrival'], {
    x: -35.95,
    y: 0.06,
    z: 33.57,
    yaw: Math.PI / 2,
  }, 'snow-arrival');
  assertPose(property.metadata.actorPoses.lookout, { x: 21.4, y: 0, z: -0.6 }, 'lookout');
  assertPose(property.metadata.actorPoses.watcher, { x: 6, y: 4, z: -1.6 }, 'watcher');
  assert.equal(gateAssembly(property.roots[0].root, 'motel.arrival-car.occupied').length, 2);

  assert.equal(late.metadata.geometryStage, 'late');
  assert.equal(late.metadata.propertyMeshCount, 955);
  assert.equal(late.metadata.arrivalCarAtPark, true);
  assertPose(late.metadata.actorPoses['snow-exterior'], {
    x: -6.28,
    y: 0,
    z: 16.8,
    yaw: Math.PI,
  }, 'snow-exterior');
  assertPose(late.metadata.actorPoses['rico-room'], { x: 1.2, y: 0, z: -8.3 }, 'rico-room');
  assertPose(late.metadata.actorPoses['chino-room'], { x: -1.2, y: 0, z: -7.8 }, 'chino-room');
  assertPose(late.metadata.actorPoses['slicer-room'], { x: 2.2, y: 0, z: -13.5 }, 'slicer-room');
  assertPose(late.metadata.actorPoses['reinforcement-hook'], { x: 26, y: 0, z: 4 }, 'hook');
  assertPose(late.metadata.actorPoses['reinforcement-prod'], { x: -26, y: 0, z: 6 }, 'prod');
  assertPose(late.metadata.actorPoses['reinforcement-pistol'], { x: 16, y: 0, z: 16 }, 'pistol');
  assert.equal(gateAssembly(late.roots[0].root, 'vehicle.motel.convertible').length, 1);
  assert.equal(gateAssembly(late.roots[0].root, 'motel.cast:snow').length, 1);
});

test('Motel drive adapter mounts the full road and both runtime vehicle producers', async () => {
  const built = await build('motel:drive');
  const root = built.roots[0].root;
  assert.equal(root.isScene, true);
  assert.deepEqual(built.metadata, {
    geometryStage: 'drive',
    roadSegmentCount: 24,
    playerCarMeshCount: 19,
    trafficCarMeshCount: 8,
    vehicleProducerCount: 2,
  });
  assert.equal(built.colliders.length, 0);
  assert.equal(objectsWhere(root, ({ name }) => /^motel\.drive\.road-segment\.\d+$/.test(name)).length, 24);
  assert.equal(objectsWhere(root, ({ name }) => /^motel\.drive\.center-dash\.\d+$/.test(name)).length, 24);
  assert.equal(objectsWhere(root, ({ name }) => /^motel\.drive\.palm\.\d+$/.test(name)).length, 24);
  assert.equal(objectsWhere(root, ({ name }) => /^motel\.drive\.lamp-pole\.(?:left|right)\.\d+$/.test(name)).length, 48);
  assert.equal(objectsWhere(root, ({ name }) => /^motel\.drive\.lamp\.(?:left|right)\.\d+$/.test(name)).length, 48);
  assert.equal(gateAssembly(root, 'motel.drive.player-car').length, 1);
  assert.equal(gateAssembly(root, 'motel.drive.traffic-car').length, 1);

  const palms = objectsWhere(root, ({ name }) => /^motel\.drive\.palm\.\d+$/.test(name));
  const poles = objectsWhere(root, ({ name }) => /^motel\.drive\.lamp-pole\./.test(name));
  assert.ok(palms.every(({ position }) => position.x === -18));
  assert.ok(poles.every(({ position }) => Math.abs(position.x) === 14));
  const lightVolumes = objectsWhere(root, ({ name }) => (
    name === 'motel.drive.headlight-beam' || name === 'motel.drive.headlight-pool'
  ));
  assert.equal(lightVolumes.length, 3);
  assert.ok(lightVolumes.every(({ userData }) => userData.sceneAuditIgnore === true));
});

test('Motel geometry helpers stay browser-independent and carry no broad gate opt-outs', () => {
  const files = [
    'src/motel/level.js',
    'src/motel/runtime-geometry.js',
    'src/motel/drive-geometry.js',
    'src/motel/main.js',
  ];
  const sources = Object.fromEntries(files.map((file) => [file, fs.readFileSync(file, 'utf8')]));
  for (const [file, source] of Object.entries(sources)) {
    assert.doesNotMatch(source, /\b(?:overlap|checkSupport)\s*:\s*false\b/, file);
  }
  assert.match(sources['src/motel/main.js'], /from '\.\/runtime-geometry\.js'/);
  assert.match(sources['src/motel/main.js'], /from '\.\/drive-geometry\.js'/);
  assert.match(
    sources['src/motel/main.js'],
    /function\s+buildDriveScene\s*\(\)\s*\{\s*const built = buildMotelDriveScene\(\);/,
  );
  assert.doesNotMatch(sources['src/motel/main.js'], /function\s+buildDriveCar\s*\(/);
  assert.doesNotMatch(sources['src/motel/runtime-geometry.js'], /from '\.\/main\.js'/);
  assert.doesNotMatch(sources['src/motel/drive-geometry.js'], /from '\.\/main\.js'/);
});

test('every Motel state scans clean with no allowlist entries or suppressions', async () => {
  const expected = {
    property: { meshes: 784, colliders: 106, envelopes: 193 },
    'late-cast': { meshes: 929, colliders: 107, envelopes: 200 },
    drive: { meshes: 193, colliders: 0, envelopes: 98 },
  };
  for (const [state, counts] of Object.entries(expected)) {
    const built = await build(`motel:${state}`);
    const snapshot = collectGeometrySnapshot({
      roots: built.roots,
      colliders: normalizeSceneColliders(built),
      THREE: built.THREE,
    });
    assert.deepEqual(snapshot.collectionErrors, [], `${state} collection errors`);
    const policy = applyScenePolicy(snapshot);
    assert.deepEqual(policy.suppressions, {
      overlap: 0,
      checkSupport: 0,
      total: 0,
      sources: [],
    }, `${state} carries a hidden gate suppression`);
    const scan = scanGeometry({
      scene: built.scene,
      state: built.state,
      records: geometryRecordsFromSnapshot(policy),
    });
    assert.deepEqual(scan.findings, [], `${state} geometry findings`);
    assert.equal(snapshot.items.length, counts.meshes, `${state} mesh count`);
    assert.equal(snapshot.colliders.length, counts.colliders, `${state} collider count`);
    assert.equal(policy.items.length - snapshot.items.length, counts.envelopes, `${state} envelope count`);
  }

  const allowlist = JSON.parse(fs.readFileSync('tools/geometry-allowlists/motel.json', 'utf8'));
  assert.deepEqual(allowlist.entries, []);
  assert.deepEqual(allowlist.suppressionPolicy, ['drive', 'late-cast', 'property'].map((state) => ({
    state,
    overlap: 0,
    checkSupport: 0,
    sources: [],
  })));
});
