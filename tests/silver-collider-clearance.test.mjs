import assert from 'node:assert/strict';
import test from 'node:test';

import { collectGeometrySnapshot } from '../tools/geometry-collect.mjs';
import { geometryRecordsFromSnapshot, scanGeometry } from '../tools/geometry-gate.mjs';
import { buildGeometrySceneState } from '../tools/geometry-scenes.mjs';
import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';
import {
  applyScenePolicy,
  normalizeSceneColliders,
  withDescriptorGeometryRandom,
} from '../tools/verify-geometry-worker.mjs';

ensureThreeShim();
ensureDomShim();

test('Silver fitted collider inventory keeps movable props clear of structural walls and neighbors', async () => {
  const built = await withDescriptorGeometryRandom(
    'silver:default',
    () => buildGeometrySceneState('silver:default'),
  );
  const colliders = normalizeSceneColliders(built);
  const snapshot = collectGeometrySnapshot({
    roots: built.roots,
    colliders,
    THREE: built.THREE,
  });
  const policy = applyScenePolicy(snapshot);
  const scan = scanGeometry({
    scene: built.scene,
    state: built.state,
    records: geometryRecordsFromSnapshot(policy),
  });

  const ids = new Set(policy.colliders.map(({ id }) => id));
  for (const required of [
    'root:silver-runtime/collider:silver-alley-crate-0',
    'root:silver-runtime/collider:silver-alley-crate-1',
    'root:silver-runtime/collider:silver-alley-crate-4',
    'root:silver-runtime/collider:silver-alley-crate-5',
    'root:silver-runtime/collider:silver-spoken-for-crate',
    'root:silver-runtime/collider:silver-undercroft-keg-2',
    'root:silver-runtime/collider:silver-service-bar',
    'root:silver-runtime/collider:silver-spare-chairs',
    'root:silver-runtime/collider:silver-mop-bucket',
  ]) assert.ok(ids.has(required), `missing semantic collider ${required}`);

  const repaired = /collider:silver-(?:alley-crate|spoken-for-crate|undercroft-keg|service-bar|spare-chairs|mop-bucket)/;
  const residual = scan.findings.filter((finding) => (
    repaired.test(finding.left ?? '')
    || repaired.test(finding.right ?? '')
    || repaired.test(finding.object ?? '')
  ));
  assert.deepEqual(residual, [], 'repaired movable/fixture colliders remain interpenetrating');

  for (const required of [
    'root:silver-runtime/collider:silver-stage-platform',
    'root:silver-runtime/collider:silver-stage-proscenium-west',
    'root:silver-runtime/collider:silver-stage-proscenium-east',
    'root:silver-runtime/collider:silver-kitchen-ramp-guard-south',
    'root:silver-runtime/collider:silver-kitchen-ramp-guard-north',
  ]) assert.ok(ids.has(required), `missing semantic fitted collider ${required}`);
});
