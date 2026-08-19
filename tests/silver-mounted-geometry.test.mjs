import assert from 'node:assert/strict';
import test from 'node:test';

import { buildGeometrySceneState } from '../tools/geometry-scenes.mjs';
import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();
const THREE = await import('three');

let builtPromise;
function buildSilver() {
  builtPromise ??= buildGeometrySceneState('silver:default');
  return builtPromise;
}

function objectsNamed(root, name) {
  const objects = [];
  root.traverse((object) => {
    if (object?.name === name) objects.push(object);
  });
  return objects;
}

test('Silver queue stanchions stand on the raised pavement', async () => {
  const built = await buildSilver();
  const [barrier] = objectsNamed(built.roots[0].root, 'queue-barrier');
  assert.ok(barrier, 'queue barrier is present');
  const bounds = new THREE.Box3().setFromObject(barrier);
  assert.ok(Math.abs(bounds.min.y - 0.14) < 1e-9, `queue barrier base is y=${bounds.min.y}`);
});

test('Silver corridor conduits declare their exact fitted wall support', async () => {
  const built = await buildSilver();
  const conduits = objectsNamed(built.roots[0].root, 'corridor-conduit');
  assert.equal(conduits.length, 2);
  assert.equal(
    conduits.every((conduit) => conduit.userData?.geometryGate?.checkSupport === false),
    true,
  );
});
