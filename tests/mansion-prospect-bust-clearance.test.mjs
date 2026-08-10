import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { ensureDomShim } from '../tools/three-shim.mjs';

ensureDomShim();

const { buildMansionInterior } = await import('../src/mansion/scenes/MansionInterior.js');
const {
  buildSilentSquatch,
} = await import('../src/mansion/scenes/SilentSquatch.js');
const {
  BASEMENT_Y,
  CELLAR_HALL,
} = await import('../src/mansion/scenes/MansionGrounds.js');

function visibleMeshBounds(root) {
  const bounds = new THREE.Box3();
  root.traverse((object) => {
    if (!object.isMesh || !object.visible) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (materials.every((material) => material?.transparent && material?.opacity <= 0.001)) return;
    bounds.union(new THREE.Box3().setFromObject(object));
  });
  return bounds;
}

function cellarSouthWestPier(root) {
  const centre = new THREE.Vector3(-14.8, BASEMENT_Y + 1.2, CELLAR_HALL.z0 + 0.22);
  let found = null;
  root.traverse((object) => {
    if (found || !object.isMesh || !object.visible) return;
    const bounds = new THREE.Box3().setFromObject(object);
    if (bounds.containsPoint(centre)) found = { object, bounds };
  });
  return found;
}

function gapInPlan(a, b) {
  const dx = Math.max(0, a.min.x - b.max.x, b.min.x - a.max.x);
  const dz = Math.max(0, a.min.z - b.max.z, b.min.z - a.max.z);
  return Math.hypot(dx, dz);
}

test('Prospect bust has a fully clear visible silhouette beside the red cellar pier', () => {
  const interior = buildMansionInterior();
  const silent = buildSilentSquatch();
  interior.root.updateMatrixWorld(true);
  silent.root.updateMatrixWorld(true);

  const bustBounds = visibleMeshBounds(silent.lab.hiddenWall.bust);
  const pier = cellarSouthWestPier(interior.root);
  assert.ok(pier, 'the built Mansion no longer exposes the red cellar pier at its authored position');

  const penetration = pier.bounds.clone().intersect(bustBounds).getSize(new THREE.Vector3());
  assert.ok(
    penetration.x <= 0 || penetration.y <= 0 || penetration.z <= 0,
    `Prospect bust still penetrates the red pier by ${penetration.x.toFixed(3)} x ${penetration.y.toFixed(3)} x ${penetration.z.toFixed(3)} m`,
  );

  const display = silent.lab.hiddenWall.bustDisplay;
  assert.equal(display.id, 'prospect-room-bust-display');
  assert.equal(display.object, silent.lab.hiddenWall.bust);
  assert.equal(display.object.name, display.objectName);
  assert.equal(display.object.userData.displayId, display.id);
  assert.deepEqual(display.position, {
    x: display.object.position.x,
    y: display.object.position.y,
    z: display.object.position.z,
  });
  assert.ok(
    gapInPlan(bustBounds, pier.bounds) >= display.minimumStructureClearance,
    `Prospect bust clears the red pier by only ${gapInPlan(bustBounds, pier.bounds).toFixed(3)} m`,
  );
  assert.deepEqual(
    display.inspectionViews.map(({ id }) => id),
    ['corridor-east', 'corridor-north', 'doorway'],
    'the browser verifier lost one of the three authored silhouette views',
  );

  const structureOverlaps = [];
  interior.root.traverse((object) => {
    if (!object.isMesh || object.isInstancedMesh || !object.visible) return;
    const bounds = new THREE.Box3().setFromObject(object);
    const overlap = bounds.clone().intersect(bustBounds).getSize(new THREE.Vector3());
    if (overlap.x <= 0.001 || overlap.y <= 0.001 || overlap.z <= 0.001) return;
    /* The marble base seats through the 20 mm floor finish deliberately; any
     * object that rises above that contact band is architecture in the bust. */
    if (bounds.max.y > BASEMENT_Y + 0.03) structureOverlaps.push(object.name || '(unnamed)');
  });
  assert.deepEqual(structureOverlaps, [],
    `Prospect bust is still embedded in Mansion structure: ${structureOverlaps.join(', ')}`);
});
