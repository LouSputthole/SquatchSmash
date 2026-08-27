import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { activeHoleNumber, setActiveHole } from '../src/golf/hole.js';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const [
  { GEOMETRY_SCENE_STATES, buildGeometrySceneState },
  { golfPreviewStage },
  { silverCasePreviewPose },
] = await Promise.all([
  import('../tools/geometry-scenes.mjs'),
  import('../src/golf/preview.js'),
  import('../src/silvercase/preview.js'),
]);

function statesFor(scene) {
  return GEOMETRY_SCENE_STATES.filter((descriptor) => descriptor.scene === scene);
}

function objectsWhere(root, predicate) {
  const matches = [];
  root.traverse((object) => { if (predicate(object)) matches.push(object); });
  return matches;
}

function gateAssembly(root, id) {
  return objectsWhere(root, (object) => object.userData?.geometryGate?.assemblyId === id);
}

function effectivelyVisible(object) {
  for (let cursor = object; cursor; cursor = cursor.parent) {
    if (cursor.visible === false) return false;
  }
  return true;
}

function isDescendantOf(object, ancestor) {
  for (let cursor = object; cursor; cursor = cursor.parent) {
    if (cursor === ancestor) return true;
  }
  return false;
}

test('later-scene public checkpoint descriptors are exact and launcher-scoped', () => {
  assert.deepEqual(
    statesFor('golf').map(({ state, checkpoint, launcherIds, hole }) => ({
      state, checkpoint, launcherIds, hole,
    })),
    [
      { state: 'hole-one', checkpoint: 'hole1', launcherIds: ['golf'], hole: 1 },
      { state: 'hole-two', checkpoint: 'hole2', launcherIds: ['golf'], hole: 2 },
      { state: 'hole-three', checkpoint: 'hole3', launcherIds: ['golf'], hole: 3 },
      { state: 'grille', checkpoint: 'grille', launcherIds: ['golf'], hole: 3 },
    ],
  );
  assert.deepEqual(
    statesFor('silvercase').map(({ state, checkpoint, launcherIds }) => ({
      state, checkpoint, launcherIds,
    })),
    ['car', 'hallway', 'room', 'prayer', 'bathroom', 'aftermath'].map((checkpoint) => ({
      state: checkpoint,
      checkpoint,
      launcherIds: ['silvercase'],
    })),
  );
  assert.deepEqual(
    statesFor('silver').map(({ state, checkpoint, launcherIds }) => ({ state, checkpoint, launcherIds })),
    [{ state: 'default', checkpoint: undefined, launcherIds: ['silver'] }],
  );
  assert.deepEqual(
    statesFor('squatchfather').map(({ state, checkpoint, launcherIds }) => ({ state, checkpoint, launcherIds })),
    [{ state: 'default', checkpoint: undefined, launcherIds: ['squatchfather'] }],
  );
});

test('Golf pure preview plans map the grille to the authored Hole 3 balcony', () => {
  assert.deepEqual(golfPreviewStage('hole1'), {
    checkpoint: 'hole1', hole: 1, completedThrough: 0, grille: false,
  });
  assert.deepEqual(golfPreviewStage('hole2'), {
    checkpoint: 'hole2', hole: 2, completedThrough: 1, grille: false,
  });
  assert.deepEqual(golfPreviewStage('hole3'), {
    checkpoint: 'hole3', hole: 3, completedThrough: 2, grille: false,
  });
  assert.deepEqual(golfPreviewStage('grille'), {
    checkpoint: 'grille', hole: 3, completedThrough: 3, grille: true,
  });
  assert.throws(() => golfPreviewStage('invented'), /Unknown Golf preview checkpoint/);
});

test('every Golf checkpoint mounts the full foursome runtime producer set', async () => {
  const expected = {
    'hole-one': { checkpoint: 'hole1', hole: 1, gallery: 0, colliders: 464, supports: 6 },
    'hole-two': { checkpoint: 'hole2', hole: 2, gallery: 0, colliders: 617, supports: 5 },
    'hole-three': { checkpoint: 'hole3', hole: 3, gallery: 5, colliders: 366, supports: 10 },
    grille: { checkpoint: 'grille', hole: 3, gallery: 5, colliders: 366, supports: 10 },
  };
  for (const [state, contract] of Object.entries(expected)) {
    const built = await buildGeometrySceneState(`golf:${state}`);
    assert.equal(built.roots.length, 1);
    assert.equal(built.roots[0].root.isScene, true, `${state} must scan the full runtime Scene`);
    assert.equal(built.metadata.checkpoint, contract.checkpoint);
    assert.equal(built.metadata.hole, contract.hole);
    assert.equal(built.metadata.grille, state === 'grille');
    assert.deepEqual(built.metadata.producerCounts, {
      golfers: 3,
      carts: 2,
      bags: 1,
      balls: 4,
      markers: 4,
      playerClubs: 3,
      galleryFigures: contract.gallery,
      smokePuffs: 64,
      terrainSupportPatches: contract.supports,
    });
    assert.equal(built.colliders.length, contract.colliders);

    const root = built.roots[0].root;
    for (const id of ['lou', 'rippinflow', 'eric']) {
      assert.equal(gateAssembly(root, `golf-runtime-golfer:${id}`).length, 1, `${state}:${id}`);
    }
    assert.equal(gateAssembly(root, 'golf-runtime-cart:lead').length, 1);
    assert.equal(gateAssembly(root, 'golf-runtime-cart:follow').length, 1);
    const { lead, follow } = built.metadata.poses.carts;
    assert.ok(
      Math.hypot(lead.x - follow.x, lead.z - follow.z) > 4.5,
      `${state} collapses the two cart poses`,
    );
    assert.equal(gateAssembly(root, 'golf-runtime-bag').length, 1);
    assert.equal(root.getObjectByName('player-club-rig')?.parent?.isCamera, true);
    assert.equal(root.getObjectByName('golf-landing-preview')?.parent, root);
    assert.equal(objectsWhere(root, ({ name }) => /^golf-ball-/.test(name)).length, 4);
    assert.equal(gateAssembly(root, 'golf-runtime-tee-balls').length, 4);
    assert.equal(objectsWhere(root, ({ name }) => /ball-(?:ground|flight)-marker/.test(name)).length, 4);
  }
});

test('Golf Adapter restores the caller active hole after building another checkpoint', async () => {
  const callerHole = activeHoleNumber();
  setActiveHole(2);
  try {
    const built = await buildGeometrySceneState('golf:hole-three');
    assert.equal(built.metadata.hole, 3);
    assert.equal(activeHoleNumber(), 2);
  } finally {
    setActiveHole(callerHole);
  }
});

test('Silver default mounts room, deterministic cast, band, taxi, driver, and Date', async () => {
  const built = await buildGeometrySceneState('silver:default');
  assert.equal(built.roots[0].root.isScene, true);
  assert.deepEqual(built.metadata.producerCounts, {
    cast: 67,
    band: 7,
    taxiRoots: 2,
    dates: 1,
  });
  assert.equal(built.metadata.castIds.length, 67);
  for (const id of ['doorman', 'chef', 'waiter', 'ape']) {
    assert.ok(built.metadata.castIds.includes(id));
    if (id !== 'ape') {
      assert.equal(gateAssembly(built.roots[0].root, `silver-cast:${id}`).length, 1);
    }
  }
  const seatingRoots = objectsWhere(built.roots[0].root, (object) => (
    object.userData?.geometryGate?.assemblyId?.startsWith('silver-seating-')
  ));
  const seatingByAssembly = new Map();
  for (const object of seatingRoots) {
    const assemblyId = object.userData.geometryGate.assemblyId;
    const members = seatingByAssembly.get(assemblyId) ?? [];
    members.push(object);
    seatingByAssembly.set(assemblyId, members);
  }
  let seatedPeople = 0;
  for (const [assemblyId, members] of seatingByAssembly) {
    const tables = members.filter(({ name }) => name === 'table');
    const chairs = members.filter(({ name }) => name === 'chair');
    const people = members.filter(({ name }) => name === 'person');
    assert.equal(tables.length, 1, assemblyId);
    assert.equal(chairs.length, tables[0].userData.seats.length, assemblyId);
    assert.ok(people.length >= 1, assemblyId);
    seatedPeople += people.length;
  }
  assert.equal(seatedPeople, 31);
  for (let index = 0; index < 7; index += 1) {
    assert.equal(gateAssembly(built.roots[0].root, `silver-band:${index}`).length, 1);
  }
  assert.equal(gateAssembly(built.roots[0].root, 'silver-taxi').length, 2);
  assert.equal(gateAssembly(built.roots[0].root, 'silver-date').length, 1);
  assert.equal(built.colliders.length, 197);
  /* The 0.11 is authored, and src/silver/date.js says why: she, the front
   * doorman and her taxi driver were all three on exactly Math.PI, which the
   * staging gate reads as three strangers sighted on one spot down the
   * street. This snapshot follows the constant rather than pinning it. */
  assert.deepEqual(built.metadata.poses.date, {
    x: 7.6, y: 0.14, z: 38.2, yaw: Math.PI + 0.11,
  });

  const dateBounds = new THREE.Box3().setFromObject(gateAssembly(built.roots[0].root, 'silver-date')[0]);
  assert.ok(dateBounds.min.y >= 0.14 - 1e-9, 'Date starts on top of the raised pavement');

  const lineCook = gateAssembly(built.roots[0].root, 'silver-cast:line0')[0];
  const hoodUtensils = built.roots[0].root.getObjectByName('hood-utensils');
  const lineBounds = new THREE.Box3().setFromObject(lineCook);
  const utensilBounds = new THREE.Box3().setFromObject(hoodUtensils);
  const overlapDepths = ['x', 'y', 'z'].map((axis) => (
    Math.min(lineBounds.max[axis], utensilBounds.max[axis])
      - Math.max(lineBounds.min[axis], utensilBounds.min[axis])
  ));
  assert.ok(
    overlapDepths.some((depth) => depth <= 0.03),
    `line cook remains embedded in hood utensils: ${JSON.stringify(overlapDepths)}`,
  );
});

test('Silver Case adapters stage all six public poses over both built worlds', async () => {
  const expectedDead = {
    car: [],
    hallway: [],
    room: [],
    prayer: ['deke'],
    bathroom: ['chester', 'deke'],
    aftermath: ['chester', 'deke', 'pruitt'],
  };
  const expectedColliders = {
    car: 0,
    // Every apartment pose shares the finished bathroom's physical toilet
    // and sink. The car remains its own world; the apartment checkpoints each
    // gain the same two authored fixture colliders.
    hallway: 22,
    room: 21,
    prayer: 21,
    bathroom: 21,
    aftermath: 20,
  };
  const expectedAssemblyMembers = {
    ape: ['person'],
    deke: ['couch', 'couchGrip', 'person'],
    chester: ['chair', 'person'],
    winston: ['person'],
    pruitt: ['big-revolver', 'person'],
  };
  for (const checkpoint of Object.keys(expectedDead)) {
    const built = await buildGeometrySceneState(`silvercase:${checkpoint}`);
    const plan = silverCasePreviewPose(checkpoint);
    assert.equal(built.roots[0].root.isScene, true);
    assert.equal(built.metadata.checkpoint, checkpoint);
    assert.equal(built.metadata.visibleWorld, plan.world);
    assert.deepEqual(built.metadata.producerCounts, {
      apartmentWorlds: 1,
      carWorlds: 1,
      cast: 5,
    });
    assert.deepEqual(built.metadata.pose.dead, expectedDead[checkpoint]);
    assert.equal(built.metadata.pose.pruittVisible, plan.pruittVisible);
    assert.equal(built.metadata.pose.caseOccluded, plan.caseOccluded);
    assert.equal(built.colliders.length, expectedColliders[checkpoint]);
    for (const id of ['ape', 'deke', 'chester', 'winston', 'pruitt']) {
      assert.deepEqual(
        gateAssembly(built.roots[0].root, `silvercase:${id}`)
          .map(({ name }) => name)
          .sort(),
        expectedAssemblyMembers[id],
        `${checkpoint}:${id}`,
      );
    }
  }
});

test('Silver Case aftermath leaves Pruitt visibly fallen clear of the open bathroom leaf and kitchen', async () => {
  const built = await buildGeometrySceneState('silvercase:aftermath');
  const root = built.roots[0].root;
  const pruittAssembly = gateAssembly(root, 'silvercase:pruitt');
  const pruitt = pruittAssembly.find(({ name }) => name === 'person');
  const pruittGun = pruittAssembly.find(({ name }) => name === 'big-revolver');
  assert.ok(pruitt, 'aftermath must include Pruitt');
  assert.equal(pruitt.visible, true);
  // This is the same clear ambush position the live checkpoint uses. Keeping
  // him on the doorway's east half made the open leaf absorb a correct shot
  // after retry, so the authored corpse must also certify the repaired pose.
  assert.ok(Math.abs(pruitt.position.x - 10.45) < 1e-9);
  assert.ok(Math.abs(pruitt.position.z - -1.92) < 1e-9);
  assert.ok(Math.abs(pruitt.rotation.y - -0.4) < 1e-9);
  assert.ok(Math.abs(pruitt.rotation.z - 0.15) < 1e-9);
  assert.ok(pruittGun, 'aftermath must leave Pruitt’s dropped revolver visible');
  assert.ok(pruittGun.parent === pruitt.parent, 'the dropped revolver must leave Pruitt’s hand but remain in the apartment world');
  assert.ok(Math.abs(pruittGun.position.x - 11.05) < 1e-9);
  assert.ok(Math.abs(pruittGun.position.z - -1.45) < 1e-9);
  const gunBounds = new built.THREE.Box3().setFromObject(pruittGun);
  assert.ok(Math.abs(gunBounds.min.y - 0.006) < 1e-6);

  const pruittMeshes = objectsWhere(pruitt, (object) => object.isMesh && effectivelyVisible(object));
  const externalMeshes = objectsWhere(root, (object) => (
    object.isMesh && effectivelyVisible(object) && !isDescendantOf(object, pruitt)
  ));
  const bounds = new built.THREE.Box3();
  const externalBounds = externalMeshes.map((object) => ({
    object, box: new built.THREE.Box3().setFromObject(object),
  }));
  const overlaps = [];
  for (const mesh of pruittMeshes) {
    bounds.setFromObject(mesh);
    for (const { object, box } of externalBounds) {
      const depthM = Math.min(
        Math.min(bounds.max.x, box.max.x) - Math.max(bounds.min.x, box.min.x),
        Math.min(bounds.max.y, box.max.y) - Math.max(bounds.min.y, box.min.y),
        Math.min(bounds.max.z, box.max.z) - Math.max(bounds.min.z, box.min.z),
      );
      if (depthM > 0.03) overlaps.push({
        pruittPart: mesh.name || mesh.type,
        other: object.parent?.name || object.name || object.type,
        depthM: Number(depthM.toFixed(4)),
      });
    }
  }
  assert.deepEqual(overlaps, []);
});

test('Silver Case hallway uses visible physical mounts instead of support suppression', async () => {
  const built = await buildGeometrySceneState('silvercase:hallway');
  const root = built.roots[0].root;
  const radiatorFeet = objectsWhere(root, ({ name }) => name === 'radiator-foot');
  assert.equal(radiatorFeet.length, 2);
  for (const foot of radiatorFeet) {
    const bounds = new built.THREE.Box3().setFromObject(foot);
    assert.ok(Math.abs(bounds.min.y - 0.001) < 1e-6);
  }
  const [radiator] = objectsWhere(root, ({ name }) => name === 'radiator');
  assert.deepEqual(radiator.userData.geometryGate, { assemblyId: 'silvercase.radiator' });

  const [exitStem] = objectsWhere(root, ({ name }) => name === 'exit-sign-ceiling-stem');
  assert.ok(exitStem, 'the exit sign needs a visible ceiling stem');
  assert.ok(Math.abs(new built.THREE.Box3().setFromObject(exitStem).max.y - 2.6) < 1e-6);
  const [exitSign] = objectsWhere(root, ({ name }) => name === 'exitSign');
  assert.deepEqual(exitSign.userData.geometryGate, { assemblyId: 'silvercase.exit-sign' });
});

test('Squatchfather default mounts all controllers, room figures, pools, mirror, and colliders', async () => {
  const built = await buildGeometrySceneState('squatchfather:default');
  assert.equal(built.roots[0].root.isScene, true);
  assert.deepEqual(built.metadata.producerCounts, {
    controllers: 3,
    sceneFigures: 3,
    impactPool: 8,
    bloodWoundPool: 8,
    bloodSpatterPool: 8,
    deathBloodPool: 2,
    mirrorOverlays: 1,
  });
  assert.deepEqual(built.metadata.figureIds, ['diner1', 'diner2', 'waiter']);
  assert.deepEqual(built.metadata.poses.prospect, {
    x: -12,
    y: 0.005,
    z: -2.6,
    yaw: Math.PI / 2 - 0.02,
  });
  for (const id of ['prospect', 'sal', 'mcclawsky', 'diner1', 'diner2']) {
    const members = gateAssembly(built.roots[0].root, `squatchfather:${id}`);
    assert.equal(members.length, 2, id);
    assert.equal(members.some(({ name }) => name === `squatchfather-${id}`), true, id);
    assert.equal(members.some(({ name }) => name.startsWith('squatchfather.chair.')), true, id);
  }
  assert.equal(built.roots[0].root.getObjectByName('squatchfather-prospect-viewmodel')?.parent?.isCamera, true);
  assert.equal(built.colliders.length, 37);
});
