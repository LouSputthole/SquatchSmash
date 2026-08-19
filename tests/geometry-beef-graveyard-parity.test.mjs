import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const [
  THREE,
  { GEOMETRY_SCENE_STATES },
  { BEEF_RUN_PREVIEW_CHECKPOINTS, stageBeefRunCheckpointGeometry },
  { GRAVEYARD_PREVIEW_CHECKPOINTS, stageGraveyardCheckpointGeometry },
  { Brushrunner },
  { buildAirfield },
  { buildAirstrip },
  { makeLou, makeOldStove },
  { TerrainStreamingSystem, treeScatterBlockedByLandmark },
  { buildGraveyard },
] = await Promise.all([
  import('three'),
  import('../tools/geometry-scenes.mjs'),
  import('../src/beefrun/preview.js'),
  import('../src/graveyard/preview.js'),
  import('../src/beefrun/aircraft.js'),
  import('../src/beefrun/airfield.js'),
  import('../src/beefrun/airstrip.js'),
  import('../src/beefrun/npc.js'),
  import('../src/beefrun/terrain.js'),
  import('../src/graveyard/world.js'),
]);

function publicDescriptors(scene) {
  return GEOMETRY_SCENE_STATES.filter((descriptor) => (
    descriptor.scene === scene && typeof descriptor.checkpoint === 'string'
  ));
}

function gateAt(object) {
  return object?.userData?.geometryGate ?? {};
}

test('Beef Run and Graveyard descriptors exactly mirror their public checkpoint vocabularies', () => {
  assert.deepEqual(
    publicDescriptors('beefrun').map(({ checkpoint }) => checkpoint),
    [...BEEF_RUN_PREVIEW_CHECKPOINTS],
  );
  assert.deepEqual(
    publicDescriptors('graveyard').map(({ checkpoint }) => checkpoint),
    [...GRAVEYARD_PREVIEW_CHECKPOINTS],
  );
  for (const descriptor of [
    ...publicDescriptors('beefrun'),
    ...publicDescriptors('graveyard'),
  ]) {
    assert.deepEqual(descriptor.launcherIds, [descriptor.scene]);
    assert.equal(descriptor.adapter, descriptor.scene);
  }
});

function beefStagingContext() {
  const scene = new THREE.Scene();
  const aircraft = {
    group: new THREE.Group(),
    copilotSeat: new THREE.Vector3(-0.42, -0.42, 1.66),
    synced: 0,
    syncTo() { this.synced++; },
    setCargoRamp() {},
  };
  aircraft.group.name = 'brushrunner-test-double';
  const physics = {
    position: new THREE.Vector3(),
    setPose(position, heading, speed) {
      this.position.copy(position);
      this.heading = heading;
      this.speed = speed;
    },
  };
  const preflight = {
    armed: false,
    groundKitStowed: false,
    arm() { this.armed = true; },
    disarm() { this.armed = false; },
    update() {},
    stowGroundKit() { this.groundKitStowed = true; },
  };
  const context = {
    scene,
    physics,
    aircraft,
    terrain: { calls: [], prime(x, z) { this.calls.push([x, z]); } },
    weather: {
      conditions: null,
      setConditions(conditions) { this.conditions = conditions; },
      update() {},
    },
    airfield: {
      anchors: {
        parking: new THREE.Vector3(-20, 2, 30),
        parkingHeading: 0.25,
        lineUp: new THREE.Vector3(0, 2, -10),
        louStand: new THREE.Vector3(-2, 2, 4),
        playerStart: new THREE.Vector3(3, 2, 5),
        stoveHangar: new THREE.Vector3(-6, 2, 8),
        stoveStand: new THREE.Vector3(-4, 2, 7),
      },
      movedTruck: false,
      moveTruckToThreshold() { this.movedTruck = true; },
    },
    airstrip: {
      anchors: {
        departStart: new THREE.Vector3(2, 700, -10000),
        departHeading: Math.PI,
      },
    },
    lou: makeLou(),
    stove: makeOldStove(),
    preflight,
    camera: new THREE.PerspectiveCamera(),
    crosswindScale: 1,
  };
  scene.add(aircraft.group, context.lou.group, context.stove.group);
  return context;
}

test('Beef Run checkpoint staging is deterministic, complete, and fail closed', () => {
  const phase = {
    preflight: 'preflight',
    takeoff: 'lineup',
    approach: 'approach',
    departure: 'heavyTakeoff',
    return: 'home',
    landing: 'home',
  };
  for (const checkpoint of BEEF_RUN_PREVIEW_CHECKPOINTS) {
    const context = beefStagingContext();
    const staged = stageBeefRunCheckpointGeometry(checkpoint, context);
    assert.equal(staged.checkpoint, checkpoint);
    assert.equal(staged.phase, phase[checkpoint]);
    assert.equal(staged.preflightArmed, checkpoint === 'preflight');
    assert.equal(staged.louAboard, checkpoint !== 'preflight');
    assert.equal(staged.groundKitStowed, checkpoint !== 'preflight');
    assert.equal(context.terrain.calls.length, 1, `${checkpoint} must prime runtime terrain once`);
    assert.ok(context.weather.conditions, `${checkpoint} must stage runtime weather`);
    assert.equal(context.aircraft.synced, checkpoint === 'preflight' ? 1 : 2);
    assert.equal(context.airfield.movedTruck, checkpoint === 'return' || checkpoint === 'landing');
  }
  assert.throws(
    () => stageBeefRunCheckpointGeometry('missing', beefStagingContext()),
    /Unknown Beef Run geometry checkpoint/,
  );
  assert.throws(
    () => stageBeefRunCheckpointGeometry('preflight'),
    /requires scene/,
  );
});

function boxDepth(left, right) {
  return Math.min(
    Math.min(left.max.x, right.max.x) - Math.max(left.min.x, right.min.x),
    Math.min(left.max.y, right.max.y) - Math.max(left.min.y, right.min.y),
    Math.min(left.max.z, right.max.z) - Math.max(left.min.z, right.min.z),
  );
}

test('Beef Run producers keep exact owners and reject real startup placement defects', () => {
  const scene = new THREE.Scene();
  const airfield = buildAirfield(scene);
  const airstrip = buildAirstrip(scene);
  const aircraft = new Brushrunner();
  aircraft.group.updateMatrixWorld(true);

  for (const root of [airfield.root, airstrip.root, aircraft.group]) {
    assert.notEqual(gateAt(root).overlap, false, `${root.name} must not hide all descendant overlap`);
    assert.notEqual(gateAt(root).checkSupport, false, `${root.name} must not hide all descendant support`);
  }
  assert.equal(airfield.dog.group.position.y, airfield.elevation + 0.12);
  assert.equal(airfield.dog.group.rotation.z, 1.45);

  const hut = airstrip.colliders.find(({ userData }) => (
    userData?.geometryGate?.assemblyId === 'beefrun.el-hueso.hut.4'
  ));
  const lorry = airstrip.colliders.find(({ userData }) => (
    userData?.geometryGate?.assemblyId === 'beefrun.el-hueso.military-truck.1'
  ));
  assert.ok(hut && lorry, 'El Hueso must publish exact hut/truck colliders');
  assert.equal(hut.intersectsBox(lorry), false, 'hut four and the first lorry must leave a real passage');

  const fixed = aircraft.group.getObjectByName('main-wing');
  const aileron = aircraft.group.getObjectByName('aileron-port');
  const gear = aircraft.group.getObjectByName('landing-gear-port');
  const door = aircraft.group.getObjectByName('cargo-door');
  const panel = aircraft.group.getObjectByName('instrument-panel');
  assert.equal(gateAt(fixed).assemblyId, 'beefrun.aircraft.fixed-airframe');
  assert.notEqual(gateAt(aileron).assemblyId, gateAt(fixed).assemblyId);
  assert.notEqual(gateAt(gear).assemblyId, gateAt(fixed).assemblyId);
  assert.notEqual(gateAt(door).assemblyId, gateAt(fixed).assemblyId);
  assert.notEqual(gateAt(panel).assemblyId, gateAt(fixed).assemblyId);
  const turtledeck = aircraft.group.getObjectByName('fuselage-turtledeck');
  assert.equal(gateAt(turtledeck).overlap, false, 'only the hollow curved roof skin skips volume overlap');
  assert.notEqual(
    gateAt(aircraft.group.getObjectByName('fuselage-corner-upper-starboard-forward')).overlap,
    false,
    'solid cabin longerons must stay audited',
  );

  const boundsOf = (name) => new THREE.Box3().setFromObject(
    aircraft.group.getObjectByName(name),
  );
  for (const side of ['starboard', 'port']) {
    assert.ok(
      boxDepth(boundsOf(`elevator-${side}-half`), boundsOf('tail-boom')) <= 0.03,
      `${side} elevator half must clear the central tail boom`,
    );
  }
  for (const side of ['starboard', 'port']) {
    const engine = side === 'port' ? 'left' : 'right';
    for (const panel of [1, 2]) {
      assert.ok(
        boxDepth(boundsOf(`flap-${side}-panel-${panel}`), boundsOf(`${engine}-engine-nacelle`)) <= 0.03,
        `${side} flap panel ${panel} must clear its engine nacelle`,
      );
    }
  }
  for (const side of ['left', 'right']) {
    assert.ok(
      boxDepth(boundsOf(`air-brake-${side}`), boundsOf('main-wing-spine')) <= 0.03,
      `${side} spoiler must sit aft of the raised wing spine`,
    );
  }

  assert.equal(treeScatterBlockedByLandmark(-180, -1450), true);
  assert.equal(treeScatterBlockedByLandmark(-140, -1424), true, 'fallen tower top owns its scrub footprint');
  assert.equal(treeScatterBlockedByLandmark(-520, -5250), true);
  assert.equal(treeScatterBlockedByLandmark(420, -6900), true);
  assert.equal(treeScatterBlockedByLandmark(0, -9300), true);
  assert.equal(treeScatterBlockedByLandmark(1100, -9300), false);

  const terrain = new TerrainStreamingSystem(scene);
  terrain.center = { cx: 0, cz: -20 };
  for (const [cx, cz] of [[-1, -21], [0, -19], [1, -19]]) {
    const { trunks } = terrain.build(cx, cz, 24);
    if (!trunks) continue;
    trunks.geometry.computeBoundingBox();
    const boxes = [];
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    for (let i = 0; i < trunks.count; i++) {
      trunks.getMatrixAt(i, matrix);
      matrix.decompose(position, rotation, scale);
      assert.equal(
        treeScatterBlockedByLandmark(position.x, position.z),
        false,
        `chunk ${cx},${cz} planted tree ${i} inside an authored landmark`,
      );
      boxes.push(trunks.geometry.boundingBox.clone().applyMatrix4(matrix));
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        assert.ok(
          boxDepth(boxes[i], boxes[j]) <= 0.03,
          `chunk ${cx},${cz} planted intersecting trunks ${i}/${j}`,
        );
      }
    }
  }
});

test('Graveyard public checkpoints reversibly stage carried, placed, and buried body geometry', () => {
  const scene = new THREE.Scene();
  const graveyard = buildGraveyard(scene);
  const carryAnchor = new THREE.PerspectiveCamera();
  carryAnchor.name = 'graveyard-test-carry-anchor';
  scene.add(carryAnchor);

  const expected = {
    arrival: { phase: 'trunk', parent: 'squatch.graveyard', visible: true },
    carried: { phase: 'carrying', parent: carryAnchor.name, visible: true },
    placed: { phase: 'placed', parent: 'squatch.graveyard', visible: true },
    buried: { phase: 'buried', parent: 'squatch.graveyard', visible: false },
  };
  let uuid = null;
  for (const checkpoint of GRAVEYARD_PREVIEW_CHECKPOINTS) {
    const staged = stageGraveyardCheckpointGeometry(checkpoint, { graveyard, carryAnchor });
    assert.equal(staged.bodyPhase, expected[checkpoint].phase);
    assert.equal(staged.body.parent, expected[checkpoint].parent);
    assert.equal(staged.body.visible, expected[checkpoint].visible);
    uuid ??= staged.body.uuid;
    assert.equal(staged.body.uuid, uuid, 'checkpoint restore must move one body, not clone replacements');
    assert.equal(
      gateAt(graveyard.body).checkSupport,
      checkpoint === 'carried' ? false : true,
      `${checkpoint} has the wrong exact carried-body support policy`,
    );
  }
  assert.equal(graveyard.root.getObjectByName('grave.hotdog.fresh.mound').visible, true);
  assert.equal(graveyard.root.getObjectByName('hotdog.temporary-marker').visible, true);

  const restored = stageGraveyardCheckpointGeometry('arrival', { graveyard, carryAnchor });
  assert.deepEqual(restored.body.position.map((value) => Number(value.toFixed(3))), [0, 0.72, 17.46]);
  assert.equal(graveyard.root.getObjectByName('grave.hotdog.fresh.mound').visible, false);
  assert.equal(graveyard.root.getObjectByName('hotdog.temporary-marker').visible, false);
  assert.throws(
    () => stageGraveyardCheckpointGeometry('carried', { graveyard }),
    /requires a carry anchor/,
  );
  assert.throws(
    () => stageGraveyardCheckpointGeometry('missing', { graveyard }),
    /Unknown Graveyard geometry checkpoint/,
  );
});

test('Beef Run and Graveyard policies are exact public-state contracts, never broad scene suppressions', async () => {
  const [beef, graveyard] = await Promise.all([
    readFile(new URL('../tools/geometry-allowlists/beefrun.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../tools/geometry-allowlists/graveyard.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);

  assert.deepEqual(
    Object.fromEntries(BEEF_RUN_PREVIEW_CHECKPOINTS.map((state) => [
      state,
      beef.entries.filter((entry) => entry.state === state).length,
    ])),
    { preflight: 32, takeoff: 37, approach: 72, departure: 37, return: 37, landing: 37 },
  );
  assert.equal(graveyard.entries.length, 22);
  assert.ok(graveyard.entries.every(({ state, left, right }) => (
    state === 'arrival'
    && [left, right].some((id) => id.includes('/name=hotdog.body#0/'))
    && [left, right].some((id) => id.includes('/name=snow.car#0/'))
  )));

  for (const [allowlist, states, rootPrefix] of [
    [beef, BEEF_RUN_PREVIEW_CHECKPOINTS, 'root:beef-run-'],
    [graveyard, GRAVEYARD_PREVIEW_CHECKPOINTS, 'root:graveyard-'],
  ]) {
    assert.deepEqual(
      allowlist.suppressionPolicy.map(({ state }) => state),
      [...states].sort(),
    );
    for (const entry of allowlist.entries) {
      assert.doesNotMatch(entry.left, /[*?\[\]]/);
      assert.doesNotMatch(entry.right, /[*?\[\]]/);
      assert.ok(entry.left.startsWith(`${rootPrefix}${entry.state}/`));
      assert.ok(entry.right.startsWith(`${rootPrefix}${entry.state}/`));
    }
    for (const policy of allowlist.suppressionPolicy) {
      assert.ok(policy.sources.every(({ sourceId }) => (
        sourceId.startsWith(`${rootPrefix}${policy.state}/`)
      )));
      assert.ok(policy.sources.every(({ sourceId }) => (
        sourceId !== `${rootPrefix}${policy.state}`
      )), `${allowlist.scene}:${policy.state} must not suppress its complete root`);
    }
  }
});
