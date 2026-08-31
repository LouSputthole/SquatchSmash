import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const [
  { buildGeometrySceneState, GEOMETRY_SCENE_STATES },
  { collectGeometrySnapshot },
  { geometryRecordsFromSnapshot, scanGeometry },
  { applyScenePolicy, normalizeSceneColliders },
  {
    APARTMENT_MARGO_ENTRY_DOOR_YAW,
    APARTMENT_MARGO_ENTRY_HEADING,
    APARTMENT_MARGO_ENTRY_POSITION,
    APARTMENT_MARGO_GEOMETRY_STAGES,
    apartmentPreviewGeometryStage,
  },
] = await Promise.all([
  import('../tools/geometry-scenes.mjs'),
  import('../tools/geometry-collect.mjs'),
  import('../tools/geometry-gate.mjs'),
  import('../tools/verify-geometry-worker.mjs'),
  import('../src/world/apartment-preview-geometry.js'),
]);

function directNamed(root, name) {
  return root.children.filter((child) => child.name === name);
}

function allNamed(root, name) {
  const matches = [];
  root.traverse((object) => {
    if (object.name === name) matches.push(object);
  });
  return matches;
}

function scanBuilt(built) {
  const snapshot = collectGeometrySnapshot({
    roots: built.roots,
    colliders: normalizeSceneColliders(built),
    THREE: built.THREE,
  });
  assert.deepEqual(snapshot.collectionErrors, []);
  const policySnapshot = applyScenePolicy(snapshot);
  const scan = scanGeometry({
    scene: built.scene,
    state: built.state,
    records: geometryRecordsFromSnapshot(policySnapshot),
  });
  return { snapshot, policySnapshot, scan };
}

test('Apartment Adapter keeps construction, compound props, and fitted dressing narrowly owned', async () => {
  const built = await buildGeometrySceneState('apartment:after-heist');
  const root = built.roots[0].root;
  const shell = directNamed(root, 'apartment-shell');
  const window = directNamed(root, 'window');
  const closet = directNamed(root, 'closet');
  assert.equal(shell.length, 1);
  assert.equal(window.length, 1);
  assert.equal(closet.length, 1);
  assert.equal(shell[0].userData.geometryGate?.assemblyId, 'apartment-shell');
  assert.equal(window[0].userData.geometryGate?.assemblyId, 'apartment-shell');
  assert.equal(shell[0].userData.geometryGate?.structural, true);
  assert.equal(window[0].userData.geometryGate?.structural, true);
  assert.ok(
    closet[0].children.slice(0, 6).every((child) => (
      child.userData.geometryGate?.assemblyId === 'apartment-shell'
      && child.userData.geometryGate?.structural === true
    )),
    'closet architecture drifted out of the apartment shell assembly',
  );

  const bathroomShell = allNamed(root, 'bathroom-shell');
  assert.equal(bathroomShell.length, 1);
  assert.equal(bathroomShell[0].userData.geometryGate?.assemblyId, 'apartment-bathroom-shell');
  assert.equal(bathroomShell[0].userData.geometryGate?.structural, true);
  assert.equal(allNamed(root, 'bathroom-light')[0]?.children.length, 3, 'bathroom light lost a ceiling mount');

  const normalizedColliders = normalizeSceneColliders(built);
  assert.equal(
    normalizedColliders.filter(({ spatial }) => spatial.typed).length,
    29,
    'every Apartment collision producer must retain semantic type information',
  );
  assert.equal(
    new Set(normalizedColliders.map(({ spatialId }) => spatialId)).size,
    29,
    'Apartment spatial IDs must be stable and unique within the scene',
  );
  assert.equal(
    normalizedColliders.filter(({ assemblyId }) => assemblyId === 'apartment-shell-collision').length,
    14,
    'fixed shell collision union changed',
  );
  assert.notEqual(
    normalizedColliders.find(({ id }) => id === 'apartment-bathroom-door-leaf')?.assemblyId,
    'apartment-shell-collision',
    'dynamic bathroom door was absorbed into the fixed shell union',
  );
  assert.equal(
    normalizedColliders.find(({ spatialId }) => (
      spatialId === 'apartment-bathroom-door-leaf'
    ))?.spatialKind,
    'door',
  );
  assert.deepEqual(
    normalizedColliders
      .filter(({ spatialKind }) => spatialKind === 'seat')
      .map(({ spatialId }) => spatialId)
      .toSorted(),
    ['apartment-couch', 'apartment-toilet'],
  );

  const frontDoor = directNamed(root, 'door').find(({ position }) => position.z > 4);
  const frontDoorPivot = frontDoor?.children.find(({ isGroup }) => isGroup);
  assert.ok(frontDoorPivot, 'Apartment front door lost its articulated pivot');
  root.updateMatrixWorld(true);
  const hinge = frontDoorPivot.getWorldPosition(new built.THREE.Vector3());
  assert.ok(
    Math.abs(hinge.x - 2.30) < 1e-9 && Math.abs(hinge.z - 4.48) < 1e-9,
    `front door must rotate on the west jamb; got (${hinge.x}, ${hinge.z})`,
  );

  const tub = allNamed(root, 'tub');
  const wash = allNamed(root, 'dress:heistWash');
  assert.equal(tub.length, 1);
  assert.equal(wash.length, 1);
  assert.equal(
    wash[0].userData.geometryGate?.assemblyId,
    tub[0].userData.geometryGate?.assemblyId,
    'post-heist towel lost its exact tub-fixture ownership',
  );

  for (const name of ['bed', 'bobblehead', 'sideboard']) {
    const objects = directNamed(root, name);
    assert.equal(objects.length, 1, `${name} direct compound count changed`);
    assert.equal(
      objects[0].userData.geometryGate?.assemblyId,
      `apartment-prop:${name}:0`,
    );
  }
  for (const name of ['bathroom', 'kitchen', 'desk', 'closet']) {
    assert.equal(
      directNamed(root, name)[0]?.userData.geometryGate?.assemblyId,
      undefined,
      `${name} must not become a room-wide overlap exemption`,
    );
  }

  const chair = directNamed(root, 'chair');
  const jacket = directNamed(root, 'dress:casualJacket');
  assert.equal(chair.length, 1);
  assert.equal(jacket.length, 1);
  assert.equal(
    jacket[0].userData.geometryGate?.assemblyId,
    chair[0].userData.geometryGate?.assemblyId,
    'the jacket draped over the chair lost its fitted ownership',
  );

  const fixtureAssemblies = new Map([
    ['corkboard', 'apartment-corkboard-fixture'],
    ['corknote', 'apartment-corkboard-fixture'],
    ['dress:suitBag', 'apartment-closet-suit-carrier'],
    ['closet-rail', 'apartment-closet-suit-carrier'],
    ['monitor-panel', 'apartment-desk-monitor-primary'],
    ['sidepanel', 'apartment-desk-monitor-side'],
  ]);
  for (const [name, assemblyId] of fixtureAssemblies) {
    const mounted = allNamed(root, name);
    assert.equal(mounted.length, 1, name + ' fixture count changed');
    assert.equal(
      mounted[0].userData.geometryGate?.assemblyId,
      assemblyId,
      name + ' lost its exact physical fixture ownership',
    );
  }

  const explicitAssemblyCounts = new Map();
  const supportOptOuts = [];
  root.traverse((object) => {
    const geometryGate = object.userData?.geometryGate;
    if (geometryGate?.assemblyId) {
      explicitAssemblyCounts.set(
        geometryGate.assemblyId,
        (explicitAssemblyCounts.get(geometryGate.assemblyId) ?? 0) + 1,
      );
    }
    if (geometryGate?.checkSupport === false || object.checkSupport === false) {
      supportOptOuts.push(object.name || object.type);
    }
  });
  assert.equal(explicitAssemblyCounts.get('apartment-desk-monitor-primary'), 3);
  assert.equal(explicitAssemblyCounts.get('apartment-desk-monitor-side'), 3);
  assert.deepEqual(supportOptOuts, [], 'Apartment fixtures must prove physical support');
});

test('Apartment counter line consumes once and reuses the Bada Bing FocusRush contract', async () => {
  const built = await buildGeometrySceneState('apartment:day-one-wake');
  const root = built.roots[0].root;
  const [powder] = directNamed(root, 'apartment-counter-powder');
  const [line] = allNamed(root, 'apartment-counter-line');
  const [card] = allNamed(root, 'apartment-counter-line-card');
  const [target] = allNamed(root, 'apartment-counter-line-target');
  assert.ok(powder && line && card && target, 'the counter line lost a visible part or interaction target');
  assert.deepEqual(powder.userData.geometryGate, { assemblyId: 'apartment-counter-white-line' });
  assert.equal(built.metadata.producerCounts.whiteLine, 1);
  assert.equal(line.visible, true);
  const cardX = card.position.x;
  assert.equal(built.metadata.previewGeometry.visible === true && powder.visible === false, false);

  const apartmentModule = await import('../src/world/apartment.js');
  assert.equal(typeof apartmentModule.buildApartment, 'function');
  const mainSource = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const apartmentSource = fs.readFileSync(new URL('../src/world/apartment.js', import.meta.url), 'utf8');
  assert.equal(mainSource.includes("import { FocusRush } from './core/focus-rush.js'"), true);
  assert.equal(mainSource.includes('const focusRush = new FocusRush({ baseFov: camera.fov })'), true);
  assert.equal(mainSource.includes('onWhiteLine: () => focusRush.start(25)'), true);
  assert.equal(mainSource.includes('focusRush.apply(camera, player, { baseMoveScale: player.moveScale })'), true);
  assert.equal(mainSource.includes("'bing.line.snort'"), true);
  assert.equal(apartmentSource.includes('ctx.onWhiteLine?.()'), true);
  assert.equal(apartmentSource.includes("audio.play('bing.line.snort'"), true);

  const apartment = built.metadata;
  assert.ok(apartment, 'headless build metadata missing');
  // Build a second isolated state and exercise the returned prop lifecycle.
  const { buildApartment } = apartmentModule;
  const scene = new built.THREE.Scene();
  const interactions = [];
  const direct = await buildApartment({
    scene,
    audio: { startLoop() {}, play() {} },
    hud: { say() {}, toast() {} },
    interaction: { register(object, descriptor) { interactions.push({ object, descriptor }); } },
    time: { dayness: 1 },
    chapter: 'day_one',
  });
  assert.equal(direct.whiteLine.consumed, false);
  assert.equal(direct.whiteLine.consume(), true);
  assert.equal(direct.whiteLine.consumed, true);
  assert.equal(direct.whiteLine.line.visible, false);
  assert.equal(direct.whiteLine.card.position.x, cardX + 0.04);
  assert.equal(direct.whiteLine.consume(), false);
  assert.equal(interactions.some(({ object }) => object.name === 'apartment-counter-line-target'), true);
});

const EXPECTED_APARTMENT_STATES = Object.freeze({
  'day-one-wake': { chapter: 'day_one', spawn: 'wake', meshes: 1054, envelopes: 140, cash: [1, 3, 6, 1], persistent: [], margo: 'hidden' },
  'after-bing-one': { chapter: 'day_one', spawn: 'front_door', meshes: 1082, envelopes: 141, cash: [1, 3, 6, 1], persistent: [], margo: 'hidden' },
  'after-squatchfather': { chapter: 'day_one', spawn: 'front_door', meshes: 1082, envelopes: 141, cash: [2, 3, 6, 1], persistent: [], margo: 'hidden' },
  'day-two-wake': { chapter: 'day_two', spawn: 'wake', meshes: 1085, envelopes: 142, cash: [2, 3, 6, 1], persistent: [], margo: 'hidden' },
  'after-beef-run': { chapter: 'day_two', spawn: 'front_door', meshes: 1094, envelopes: 143, cash: [3, 3, 6, 1], persistent: ['tammyDashboardMug'], margo: 'hidden' },
  'after-motel': { chapter: 'day_two', spawn: 'front_door', meshes: 1097, envelopes: 143, cash: [4, 5, 6, 1], persistent: ['tammyDashboardMug'], margo: 'hidden' },
  'day-three-wake': { chapter: 'no_wake', spawn: 'wake', meshes: 1141, envelopes: 146, cash: [4, 5, 6, 1], persistent: ['tammyDashboardMug'], margo: 'hidden' },
  'after-no-wake': { chapter: 'date', spawn: 'front_door', meshes: 1144, envelopes: 146, cash: [4, 6, 7, 1], persistent: ['tammyDashboardMug'], margo: 'hidden' },
  'after-silver-room': { chapter: 'date', spawn: 'front_door', meshes: 1196, envelopes: 147, cash: [4, 6, 7, 1], persistent: ['tammyDashboardMug'], margo: 'come-home-entry' },
  'day-four-wake': { chapter: 'golf_morning', spawn: 'wake', meshes: 1277, envelopes: 150, cash: [4, 6, 7, 1], persistent: ['tammyDashboardMug'], margo: 'wake-lying' },
  'after-golf': { chapter: 'heist_day', spawn: 'front_door', meshes: 1385, envelopes: 157, cash: [4, 6, 7, 1], persistent: ['tammyDashboardMug'], margo: 'hidden' },
  'after-heist': { chapter: 'post_heist', spawn: 'front_door', meshes: 1300, envelopes: 153, cash: [4, 6, 8, 5], persistent: ['tammyDashboardMug'], margo: 'hidden' },
});

test('Apartment geometry remains complete and clean across every public campaign preview state', async () => {
  const descriptors = GEOMETRY_SCENE_STATES.filter(({ scene }) => scene === 'apartment');
  assert.equal(descriptors.length, 12, 'Apartment public preview coverage changed');
  assert.deepEqual(descriptors.map(({ state }) => state), Object.keys(EXPECTED_APARTMENT_STATES));
  for (const descriptor of descriptors) {
    const expected = EXPECTED_APARTMENT_STATES[descriptor.state];
    const built = await buildGeometrySceneState(descriptor.id);
    const root = built.roots[0].root;
    assert.deepEqual(built.metadata.producerCounts, {
      /* 1729 -> 1731 on 2026-08-31: Margo's shared head grew two eyelid
       * meshes for the sleep note (src/silver/margo.js). */
      proceduralMeshes: 1731,
      colliders: 29,
      dressing: 29,
      margo: 1,
      whiteLine: 1,
    }, `${descriptor.id} producer inventory`);
    assert.equal(root.children.filter(({ name }) => name.startsWith('dress:')).length, 23);
    assert.deepEqual(built.metadata.apartmentPreview, {
      spawn: expected.spawn,
      chapter: expected.chapter,
      persistentDressing: expected.persistent,
      cashPiles: {
        cashSmall: expected.cash[0],
        cashMid: expected.cash[1],
        cashStacks: expected.cash[2],
        heistCut: expected.cash[3],
      },
    });
    assert.equal(apartmentPreviewGeometryStage(descriptor.state), expected.margo);
    assert.equal(built.metadata.previewGeometry.stage, expected.margo);
    assert.equal(
      built.metadata.previewGeometry.visible,
      expected.margo !== APARTMENT_MARGO_GEOMETRY_STAGES.HIDDEN,
    );
    const margo = directNamed(root, 'margo');
    assert.equal(margo.length, 1);
    assert.equal(margo[0].visible, built.metadata.previewGeometry.visible);

    if (expected.margo === APARTMENT_MARGO_GEOMETRY_STAGES.COME_HOME_ENTRY) {
      assert.equal(built.metadata.previewGeometry.pose, 'standing');
      assert.deepEqual(built.metadata.previewGeometry.position, APARTMENT_MARGO_ENTRY_POSITION);
      assert.equal(built.metadata.previewGeometry.yaw, APARTMENT_MARGO_ENTRY_HEADING);
      assert.equal(built.metadata.previewGeometry.frontDoorYaw, APARTMENT_MARGO_ENTRY_DOOR_YAW);
      assert.equal(margo[0].userData.geometryGate?.assemblyId, 'apartment-margo');
    } else if (expected.margo === APARTMENT_MARGO_GEOMETRY_STAGES.WAKE_LYING) {
      assert.equal(built.metadata.previewGeometry.pose, 'lying');
      assert.deepEqual(built.metadata.previewGeometry.position, { x: -3.58, y: 0.93, z: -3.12 });
      assert.equal(built.metadata.previewGeometry.yaw, -1.35);
      const bed = directNamed(root, 'bed');
      assert.equal(bed.length, 1);
      assert.equal(margo[0].userData.geometryGate?.assemblyId, 'apartment-margo-bed-occupancy');
      assert.equal(bed[0].userData.geometryGate?.assemblyId, 'apartment-margo-bed-occupancy');
    } else {
      assert.equal(margo[0].userData.geometryGate?.assemblyId, 'apartment-margo');
    }

    const { snapshot, policySnapshot, scan } = scanBuilt(built);
    assert.equal(snapshot.items.length, expected.meshes, `${descriptor.id} visible mesh count`);
    assert.equal(snapshot.colliders.length, 29, `${descriptor.id} collider count`);
    assert.equal(
      policySnapshot.items.length - snapshot.items.length,
      expected.envelopes,
      `${descriptor.id} support-envelope count`,
    );
    assert.deepEqual(policySnapshot.suppressions, {
      overlap: 0, checkSupport: 0, total: 0, sources: [],
    }, `${descriptor.id} hidden suppression`);
    assert.deepEqual(scan.findings, [], `${descriptor.id} regained a geometry finding`);
  }
});

test('Apartment runtime delegates both visible Margo beats to the pure geometry stage', () => {
  const main = fs.readFileSync('src/main.js', 'utf8');
  assert.match(main, /APARTMENT_MARGO_GEOMETRY_STAGES\.COME_HOME_ENTRY/);
  assert.match(main, /APARTMENT_MARGO_GEOMETRY_STAGES\.WAKE_LYING/);
  assert.equal(
    [...main.matchAll(/APARTMENT_MARGO_ENTRY_DOOR_YAW \* Math\.min/g)].length,
    2,
    'both directions of Margo\'s walk must use the canonical staged door angle',
  );
  assert.doesNotMatch(main, /-1\.0 \* Math\.min/);
  for (const sourceFile of [
    'src/world/apartment.js',
    'src/world/props.js',
    'src/world/apartment-preview-geometry.js',
  ]) {
    assert.doesNotMatch(fs.readFileSync(sourceFile, 'utf8'), /\b(?:overlap|checkSupport)\s*:\s*false\b/);
  }
});
