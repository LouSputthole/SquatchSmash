import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const [
  THREE,
  { buildGeometrySceneState, GEOMETRY_SCENE_STATES },
  { collectGeometrySnapshot },
  { geometryRecordsFromSnapshot, scanGeometry },
  { applyScenePolicy, normalizeSceneColliders },
  { buildHeistCrew },
  { buildHeistLevel },
  {
    HEIST_PREVIEW_CHECKPOINTS,
    HEIST_SQUAD_FORMATIONS,
    heistCheckpointGeometry,
    heistSquadAnchorIds,
    poseHeistCrewGeometry,
    stageHeistCheckpointGeometry,
  },
] = await Promise.all([
  import('three'),
  import('../tools/geometry-scenes.mjs'),
  import('../tools/geometry-collect.mjs'),
  import('../tools/geometry-gate.mjs'),
  import('../tools/verify-geometry-worker.mjs'),
  import('../src/heist/cast.js'),
  import('../src/heist/level.js'),
  import('../src/heist/preview.js'),
]);

const EXPECTED = Object.freeze({
  safehouse: { phase: 'safehouse', masked: false, vaultOpen: false },
  bank_lobby: { phase: 'bank', masked: true, vaultOpen: false },
  vault_open: { phase: 'bank', masked: true, vaultOpen: true },
  street_withdrawal: { phase: 'street', masked: true, vaultOpen: true },
  mercer_garage: { phase: 'garage', masked: true, vaultOpen: true },
  vehicle_escape: { phase: 'driving', masked: true, vaultOpen: true },
  safehouse_debrief: { phase: 'safehouse', masked: true, vaultOpen: true },
});

test('Heist public checkpoints own exact deterministic geometry stages', () => {
  assert.deepEqual(HEIST_PREVIEW_CHECKPOINTS, Object.keys(EXPECTED));
  const descriptors = GEOMETRY_SCENE_STATES.filter(({ scene }) => scene === 'heist');
  assert.deepEqual(descriptors.map(({ checkpoint }) => checkpoint), HEIST_PREVIEW_CHECKPOINTS);
  assert.deepEqual(
    descriptors.map(({ state }) => state),
    HEIST_PREVIEW_CHECKPOINTS.map((checkpoint) => checkpoint.replaceAll('_', '-')),
  );
  assert.equal(heistSquatchAnchorCount(), 30);
  assert.throws(() => heistCheckpointGeometry('missing'), /Unknown Heist geometry checkpoint/);
  assert.throws(() => stageHeistCheckpointGeometry('safehouse'), /requires the complete level and crew/);
  assert.throws(() => poseHeistCrewGeometry(), /requires a complete level, crew Map, and phase/);
});

function heistSquatchAnchorCount() {
  return heistSquadAnchorIds().length;
}

test('Heist checkpoint staging mounts the complete crew and visible setpiece state', () => {
  for (const checkpoint of HEIST_PREVIEW_CHECKPOINTS) {
    const scene = new THREE.Scene();
    const level = buildHeistLevel(scene);
    const crew = buildHeistCrew(level.phases.safehouse.group);
    const staged = stageHeistCheckpointGeometry(checkpoint, { level, crew });
    const expected = EXPECTED[checkpoint];

    assert.equal(staged.phase, expected.phase, checkpoint);
    assert.equal(crew.size, 5, `${checkpoint} lost a crew member`);
    assert.equal(level.phases.bank.interactables.vault.userData.open, expected.vaultOpen, checkpoint);
    for (const [phase, value] of Object.entries(level.phases)) {
      assert.equal(value.group.visible, phase === expected.phase, `${checkpoint}:${phase} visibility drifted`);
    }

    const formation = HEIST_SQUAD_FORMATIONS[expected.phase];
    for (const [index, actor] of [...crew.values()].entries()) {
      assert.equal(actor.group.parent, level.phases[expected.phase].group, `${checkpoint}:${actor.id} parent`);
      assert.deepEqual(
        [actor.group.position.x, actor.group.position.y, actor.group.position.z],
        [formation[index][0], 0, formation[index][1]],
        `${checkpoint}:${actor.id} formation`,
      );
      assert.equal(actor.masked, expected.masked, `${checkpoint}:${actor.id} mask state`);
      assert.equal(actor.group.getObjectByName('heist-mask')?.visible, expected.masked);
    }

    if (checkpoint === 'vehicle_escape') {
      const { x, z, heading } = level.phases.driving.start;
      assert.deepEqual(level.phases.driving.car.position.toArray(), [x, 0, z]);
      assert.equal(level.phases.driving.car.rotation.y, heading - Math.PI / 2);
      assert.deepEqual(
        level.phases.driving.pursuers.map((cruiser) => cruiser.visible),
        [true, false, false],
      );
      assert.deepEqual(
        level.phases.driving.pursuers.map((cruiser) => cruiser.position.z),
        [z - 16, z - 25, z - 34],
      );
    }
  }
});


test('Heist geometry Adapter builds the complete runtime crew at every public checkpoint', async () => {
  for (const checkpoint of HEIST_PREVIEW_CHECKPOINTS) {
    const id = `heist:${checkpoint.replaceAll('_', '-')}`;
    const built = await buildGeometrySceneState(id);
    assert.equal(built.metadata.checkpoint, checkpoint);
    assert.equal(built.metadata.phase, EXPECTED[checkpoint].phase);
    assert.equal(built.metadata.crewCount, 5);
    assert.equal(built.roots.length, 1);
    assert.equal(built.roots[0].root.name, `phase-${EXPECTED[checkpoint].phase}`);
    assert.equal(
      [...built.roots[0].root.children].filter((child) => child.name.startsWith('crew-')).length,
      5,
      `${checkpoint} Adapter lost runtime cast geometry`,
    );
  }
});

test('Heist public checkpoints remain strict-geometry clean', async () => {
  for (const checkpoint of HEIST_PREVIEW_CHECKPOINTS) {
    const id = `heist:${checkpoint.replaceAll('_', '-')}`;
    const built = await buildGeometrySceneState(id);
    const snapshot = collectGeometrySnapshot({
      THREE,
      roots: built.roots,
      colliders: normalizeSceneColliders(built),
    });

    assert.deepEqual(snapshot.collectionErrors, [], `${id} collection errors`);
    const policy = applyScenePolicy(snapshot);
    assert.equal(policy.suppressions.checkSupport, 0, `${id} support checks were suppressed`);
    const scan = scanGeometry({
      scene: built.scene,
      state: built.state,
      records: geometryRecordsFromSnapshot(policy),
    });
    assert.deepEqual(scan.findings, [], `${id} geometry findings`);
  }
});
