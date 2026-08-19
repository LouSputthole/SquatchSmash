import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const [
  { GEOMETRY_SCENE_STATES, buildGeometrySceneState },
  {
    NO_WAKE_GEOMETRY_CHECKPOINTS,
    NO_WAKE_PREVIEW_CHECKPOINTS,
    poseNoWakeExecutedBodyGeometry,
    prepareNoWakeWeightedBodyGeometry,
    stageNoWakeCheckpointGeometry,
  },
  {
    ENOLA_CHECKPOINT_ALIASES,
    ENOLA_CHECKPOINT_WEATHER,
    ENOLA_PREVIEW_CHECKPOINTS,
    applyEnolaCheckpointWeather,
    applyEnolaPhaseCheckpointWeather,
    stageEnolaCheckpointGeometry,
  },
  { PALACE_PREVIEW_CHECKPOINTS, stagePalaceCheckpointGeometry },
] = await Promise.all([
  import('../tools/geometry-scenes.mjs'),
  import('../src/nowake/preview.js'),
  import('../src/enolasquatch/preview.js'),
  import('../src/cartel-palace/preview.js'),
]);

function publicDescriptors(scene) {
  return GEOMETRY_SCENE_STATES.filter((descriptor) => (
    descriptor.scene === scene && typeof descriptor.checkpoint === 'string'
  ));
}

function onlyNamed(root, name) {
  const matches = [];
  root.traverse((object) => {
    if (object?.name === name) matches.push(object);
  });
  assert.equal(matches.length, 1, `expected one ${name}, found ${matches.length}`);
  return matches[0];
}

function onlyAssembly(root, assemblyId) {
  const matches = [];
  root.traverse((object) => {
    if (object?.userData?.geometryGate?.assemblyId === assemblyId) matches.push(object);
  });
  assert.equal(matches.length, 1, `expected one ${assemblyId}, found ${matches.length}`);
  return matches[0];
}

test('late-scene descriptor checkpoints are sourced from each runtime preview vocabulary', () => {
  assert.deepEqual(
    publicDescriptors('nowake').map(({ checkpoint }) => checkpoint),
    [...NO_WAKE_PREVIEW_CHECKPOINTS],
  );
  assert.deepEqual(
    publicDescriptors('enolasquatch').map(({ checkpoint }) => checkpoint),
    [...ENOLA_PREVIEW_CHECKPOINTS],
  );
  assert.deepEqual(
    publicDescriptors('cartel-palace').map(({ checkpoint }) => checkpoint),
    [...PALACE_PREVIEW_CHECKPOINTS],
  );

  for (const descriptor of [
    ...publicDescriptors('nowake'),
    ...publicDescriptors('enolasquatch'),
    ...publicDescriptors('cartel-palace'),
  ]) {
    assert.deepEqual(descriptor.launcherIds, [descriptor.scene]);
  }

  assert.deepEqual(NO_WAKE_GEOMETRY_CHECKPOINTS, [
    'dock', 'underway', 'inlet', 'confrontation', 'body', 'weighted', 'return',
  ]);
  const weighted = GEOMETRY_SCENE_STATES.filter(({ scene, geometryStage }) => (
    scene === 'nowake' && geometryStage === 'weighted'
  ));
  assert.equal(weighted.length, 1);
  assert.equal(weighted[0].checkpoint, undefined, 'internal weighted state must not pose as a public link');
});

test('NO WAKE body, weighted carry, and return checkpoints preserve visible runtime consequences', async () => {
  const [body, weighted, returning] = await Promise.all([
    buildGeometrySceneState('nowake:body'),
    buildGeometrySceneState('nowake:weighted'),
    buildGeometrySceneState('nowake:return'),
  ]);

  const bodyRoot = body.roots[0].root;
  const willyBody = onlyAssembly(bodyRoot, 'no-wake-cast:willy');
  assert.deepEqual(willyBody.position.toArray(), [0.10, -0.4317387017, -3.35]);
  assert.deepEqual(
    [willyBody.rotation.x, willyBody.rotation.y, willyBody.rotation.z],
    [-1.42, 0, 0],
  );
  const bodyBounds = new body.THREE.Box3().setFromObject(willyBody);
  const soleBounds = new body.THREE.Box3().setFromObject(onlyNamed(bodyRoot, 'cabin sole'));
  assert.ok(
    Math.abs((bodyBounds.min.y - soleBounds.max.y) + 0.02) <= 0.001,
    'executed Willy must be bedded exactly 2 cm into the cabin sole',
  );
  for (const name of ['galley and wet bar', 'fixed swivel bar stool 1', 'fixed swivel bar stool 2']) {
    assert.equal(
      bodyBounds.intersectsBox(new body.THREE.Box3().setFromObject(onlyNamed(bodyRoot, name))),
      false,
      `executed Willy still intersects ${name}`,
    );
  }
  assert.equal(onlyNamed(bodyRoot, 'Lou 9mm pistol').visible, true);
  assert.equal(onlyNamed(bodyRoot, 'Booski 9mm pistol').visible, true);
  assert.equal(onlyNamed(bodyRoot, 'Tony revolver').visible, false);

  const weightedRoot = weighted.roots[0].root;
  assert.equal(weighted.metadata.bodyStage, 'weighted');
  assert.equal(onlyNamed(weightedRoot, 'wrapped body').visible, true);
  assert.equal(onlyAssembly(weightedRoot, 'no-wake-cast:willy').visible, false);
  const curtain = onlyNamed(weightedRoot, 'V-berth curtain');
  assert.equal(curtain.scale.x, 0.12);
  assert.equal(curtain.position.x, -1.72);
  const weightedLou = onlyAssembly(weightedRoot, 'no-wake-cast:lou');
  assert.deepEqual(weightedLou.position.toArray(), [0.40, 1.02, 0.20]);
  assert.equal(
    new weighted.THREE.Box3().setFromObject(weightedLou)
      .intersectsBox(new weighted.THREE.Box3().setFromObject(onlyNamed(weightedRoot, 'wrapped body'))),
    false,
    'Lou still stands inside the carried body',
  );
  for (const name of ['Lou 9mm pistol', 'Booski 9mm pistol', 'Tony revolver']) {
    assert.equal(onlyNamed(weightedRoot, name).visible, false, `${name} remains in a carrier's hand`);
  }

  const returnRoot = returning.roots[0].root;
  assert.equal(returning.metadata.bodyStage, 'weighted');
  assert.equal(onlyNamed(returnRoot, 'wrapped body').visible, false);
  assert.equal(onlyAssembly(returnRoot, 'no-wake-cast:willy').visible, false);
  assert.deepEqual(
    onlyAssembly(returnRoot, 'no-wake-cast:lou').position.toArray(),
    [0, 1.02, 3.45],
  );
  assert.deepEqual(
    onlyAssembly(returnRoot, 'no-wake-cast:booski').position.toArray(),
    [-1.30, 1.02, 3.90],
  );
  assert.deepEqual(
    onlyAssembly(returnRoot, 'no-wake-cast:irish').position.toArray(),
    [1.75, 1.70, -4.55],
  );
  const irishBounds = new returning.THREE.Box3()
    .setFromObject(onlyAssembly(returnRoot, 'no-wake-cast:irish'));
  for (const name of ['anchor hatch lid', 'forward locker lid']) {
    assert.equal(
      irishBounds.intersectsBox(new returning.THREE.Box3().setFromObject(onlyNamed(returnRoot, name))),
      false,
      `Irish still stands across ${name}`,
    );
  }
});

test('Enola preview and headless staging share organic checkpoint weather', () => {
  const applied = [];
  const weather = { setConditions: (conditions) => applied.push(conditions) };
  for (const checkpoint of ENOLA_PREVIEW_CHECKPOINTS) {
    assert.equal(
      applyEnolaPhaseCheckpointWeather(ENOLA_CHECKPOINT_ALIASES[checkpoint], weather),
      ENOLA_CHECKPOINT_WEATHER[checkpoint],
    );
  }
  assert.deepEqual(applied, ENOLA_PREVIEW_CHECKPOINTS.map((checkpoint) => (
    ENOLA_CHECKPOINT_WEATHER[checkpoint]
  )));
  assert.equal(ENOLA_CHECKPOINT_WEATHER.flak.cloudDensity, 0.6);
  assert.equal(ENOLA_CHECKPOINT_WEATHER.detonation.night, 1);
  assert.equal(ENOLA_CHECKPOINT_WEATHER.return.lightning, 0.1);
  assert.equal(applyEnolaPhaseCheckpointWeather('walkaround', weather), null);
  assert.throws(
    () => applyEnolaCheckpointWeather('missing', weather),
    /Unknown Enola geometry checkpoint/,
  );
  assert.throws(
    () => applyEnolaCheckpointWeather('preflight'),
    /requires WeatherSystem/,
  );
});

test('late-scene pure geometry staging rejects unknown checkpoints and incomplete compositions', () => {
  assert.throws(
    () => stageNoWakeCheckpointGeometry('missing'),
    /Unknown NO WAKE geometry checkpoint/,
  );
  assert.throws(
    () => stageNoWakeCheckpointGeometry('dock'),
    /requires world\.boat and bodyRig/,
  );
  assert.throws(
    () => poseNoWakeExecutedBodyGeometry(),
    /requires the boat cast/,
  );
  assert.throws(
    () => prepareNoWakeWeightedBodyGeometry(),
    /requires the boat cast and body rig/,
  );

  assert.throws(
    () => stageEnolaCheckpointGeometry('missing'),
    /Unknown Enola geometry checkpoint/,
  );
  assert.throws(
    () => stageEnolaCheckpointGeometry('preflight'),
    /missing a required runtime producer/,
  );

  assert.throws(
    () => stagePalaceCheckpointGeometry('missing'),
    /Unknown Cartel Palace geometry checkpoint/,
  );
  assert.throws(
    () => stagePalaceCheckpointGeometry('approach'),
    /requires the complete world and cast/,
  );
});
