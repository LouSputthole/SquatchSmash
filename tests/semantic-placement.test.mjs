import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureDomShim();
ensureThreeShim();

const [
  THREE,
  { markSemanticPlacement, auditSceneSemanticPlacements },
  { buildLuxuryApartment },
  { buildCountrysideCabin },
  { buildCartelPalace },
] = await Promise.all([
  import('three'),
  import('../src/core/semantic-placement.js'),
  import('../src/luxury-apartment/world.js'),
  import('../src/cabin/world.js'),
  import('../src/cartel-palace/world.js'),
]);

function box(name, size = [1, 1, 1]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial());
  mesh.name = name;
  return mesh;
}

test('semantic placement catches unsupported, backward, tilted, disconnected, and out-of-room props', () => {
  const root = new THREE.Group();
  const support = box('desk', [2, 0.2, 2]);
  support.position.y = 0.1;
  const prop = box('broken-prop', [0.2, 0.2, 0.2]);
  prop.position.set(2, 1, 0);
  prop.rotation.z = Math.PI / 2;
  markSemanticPlacement(prop, {
    id: 'synthetic.broken-prop',
    surface: { kind: 'floor', support: 'desk', maxGap: 0.02 },
    upright: { maxDegrees: 2 },
    facing: { direction: [0, 0, -1], maxDegrees: 2 },
    room: { min: [-1, 0, -1], max: [1, 1, 1] },
    seams: [{ target: 'desk', maxGap: 0.02 }],
  });
  root.add(support, prop);

  const result = auditSceneSemanticPlacements(root);
  assert.deepEqual(result.audited, ['synthetic.broken-prop']);
  assert.deepEqual(
    new Set(result.findings.map(({ rule }) => rule)),
    new Set(['support-footprint', 'surface-gap', 'upright', 'facing', 'room-bounds', 'seam-gap']),
  );
});

test('repaired Luxury, Cabin, and Cartel Palace props satisfy explicit semantic placement contracts', async () => {
  const luxury = await buildLuxuryApartment({
    scene: new THREE.Scene(),
    interaction: { register() {} },
  });
  const cabin = await buildCountrysideCabin({
    scene: new THREE.Scene(),
    interaction: { register() {} },
  });
  const palace = buildCartelPalace(new THREE.Scene());

  const audits = [
    auditSceneSemanticPlacements(luxury.root),
    auditSceneSemanticPlacements(cabin.root),
    auditSceneSemanticPlacements(palace.root),
  ];
  assert.deepEqual(audits.map(({ audited }) => audited.length), [1, 2, 2]);
  assert.deepEqual(audits.flatMap(({ findings }) => findings), []);
});
