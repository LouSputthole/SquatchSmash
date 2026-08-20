import assert from 'node:assert/strict';
import test from 'node:test';

import { buildGeometrySceneState } from '../tools/geometry-scenes.mjs';
import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

test('Silver publishes unique semantic identities for every runtime collider', async () => {
  const built = await buildGeometrySceneState('silver:default');
  const names = built.colliders.map((collider) => collider?.name);

  assert.ok(names.length > 100, 'Silver should expose the complete room collider inventory');
  assert.equal(names.every((name) => typeof name === 'string' && name.trim()), true);
  assert.equal(new Set(names).size, names.length, 'Silver collider names must be unique');

  const sceneNames = new Set();
  built.roots[0].root.traverse((object) => {
    if (object?.name) sceneNames.add(object.name);
  });

  const wallColliders = names.filter((name) => /^silver-wall-\d+-collider$/.test(name));
  const doorColliders = names.filter((name) => /^silver-door-.+-collider$/.test(name));
  const standaloneColliders = names.filter((name) => /^silver-solid-\d+$/.test(name));

  assert.ok(wallColliders.length > 50, 'expected the authored wall-run collider inventory');
  assert.ok(doorColliders.length >= 5, 'expected every swinging doorway collider');
  assert.ok(standaloneColliders.length > 10, 'expected named standalone fixture colliders');
  assert.equal(
    wallColliders.every((name) => sceneNames.has(name.replace(/-collider$/, ''))),
    true,
    'every wall collider must resolve to its rendered wall segment',
  );
  assert.equal(
    doorColliders.every((name) => sceneNames.has(name.replace(/-collider$/, ''))),
    true,
    'every door collider must resolve to its rendered door assembly',
  );
});
