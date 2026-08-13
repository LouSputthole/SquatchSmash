import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const THREE = await import('three');
const { buildNoWakeWorld } = await import('../src/nowake/world.js');

test('the real WakePool uses a feathered alpha field instead of opaque rectangular edges', () => {
  const world = buildNoWakeWorld(new THREE.Scene());
  const wake = world.wake;
  assert.equal(wake.pool.length, 72, 'the bounded production wake pool changed size');
  const texture = wake.pool[0]?.material?.map;
  const image = texture?.image;
  assert.ok(texture?.isDataTexture && image?.data instanceof Uint8Array,
    'the real wake material has no inspectable procedural feathered alpha field');

  const alphaAt = (x, y) => image.data[(y * image.width + x) * 4 + 3];
  const centre = alphaAt(Math.floor(image.width / 2), Math.floor(image.height / 2));
  const edgeAlpha = [];
  for (let x = 0; x < image.width; x++) {
    edgeAlpha.push(alphaAt(x, 0), alphaAt(x, image.height - 1));
  }
  for (let y = 1; y < image.height - 1; y++) {
    edgeAlpha.push(alphaAt(0, y), alphaAt(image.width - 1, y));
  }
  const edge = Math.max(...edgeAlpha);
  const transparentPixels = image.data.filter((_, index) => index % 4 === 3 && image.data[index] <= 4).length;
  const centreX = Math.floor(image.width / 2);
  const continuousCore = [];
  for (let y = Math.floor(image.height * .20); y <= Math.ceil(image.height * .80); y++) {
    continuousCore.push(alphaAt(centreX, y));
  }
  assert.ok(centre >= 160, `wake foam centre alpha is only ${centre}/255`);
  assert.ok(edge <= 4, `wake still has a hard rectangular border at ${edge}/255 alpha`);
  assert.ok(transparentPixels >= image.width * image.height * .20,
    `only ${transparentPixels} foam texels are transparent outside the streak`);
  assert.ok(Math.min(...continuousCore) >= 48,
    `wake foam streak breaks to ${Math.min(...continuousCore)}/255 along its centre line`);
  assert.ok(wake.pool.every((quad) => quad.material.map === texture),
    'wake quads allocate independent foam textures instead of sharing one field');
});

test('oldest real WakePool quads fade before their world bounds become giant polygons', () => {
  const scene = new THREE.Scene();
  const world = buildNoWakeWorld(scene);
  const wake = world.wake;
  wake.emit(new THREE.Vector3(0, 0, 0), 0, 4.8, .11);
  const emittedPair = wake.pool.filter((quad) => quad.visible);
  assert.equal(emittedPair.length, 2,
    'one real wake emission no longer creates the authored two-sided pair');
  assert.equal(emittedPair[0].material.map, emittedPair[1].material.map,
    'the paired streaks do not share one continuous foam field');
  assert.ok(Math.abs(emittedPair[0].position.x + emittedPair[1].position.x) < 1e-9,
    'the authored wake pair is no longer symmetric across the hull');

  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const dt = 1 / 60;
  let elapsed = 0;
  let lastVisibleAt = 0;
  let maxWorldSpan = 0;
  while (elapsed < 6) {
    wake.update(dt);
    elapsed += dt;
    scene.updateMatrixWorld(true);
    const visible = wake.pool.filter((quad) => quad.visible);
    if (visible.length) lastVisibleAt = elapsed;
    for (const quad of visible) {
      box.setFromObject(quad).getSize(size);
      maxWorldSpan = Math.max(maxWorldSpan, size.x, size.z);
    }
  }

  const failures = [];
  if (maxWorldSpan > 4.8) failures.push(`oldest quad reached ${maxWorldSpan.toFixed(2)} m`);
  if (lastVisibleAt > 3.2) failures.push(`oldest quad stayed visible for ${lastVisibleAt.toFixed(2)} s`);
  if (wake.pool.some((quad) => quad.visible)) failures.push('wake did not return to its bounded pool');
  assert.deepEqual(failures, [], failures.join('; '));
});

test('the real WakePool reuses one geometry/texture and disposes its bounded resources', () => {
  const world = buildNoWakeWorld(new THREE.Scene());
  const wake = world.wake;
  const originalPool = [...wake.pool];
  for (let i = 0; i < 100; i++) {
    wake.emit(new THREE.Vector3(0, 0, -i * .35), 0, 4.8, .11);
    wake.update(.11);
  }

  const geometries = new Set(wake.pool.map((quad) => quad.geometry));
  const textures = new Set(wake.pool.map((quad) => quad.material.map).filter(Boolean));
  const materials = new Set(wake.pool.map((quad) => quad.material));
  const failures = [];
  if (wake.pool.length !== 72 || wake.pool.some((quad, index) => quad !== originalPool[index])) {
    failures.push('emission allocated or replaced pooled quads');
  }
  if (geometries.size !== 1) failures.push(`wake allocated ${geometries.size} plane geometries`);
  if (textures.size !== 1) failures.push(`wake owns ${textures.size} shared foam textures`);
  if (materials.size > 72) failures.push(`wake allocated ${materials.size} pooled materials`);
  if (typeof wake.dispose !== 'function') failures.push('WakePool has no public resource disposal');
  assert.deepEqual(failures, [], failures.join('; '));

  let geometryDisposals = 0;
  let textureDisposals = 0;
  let materialDisposals = 0;
  [...geometries][0].addEventListener('dispose', () => { geometryDisposals++; });
  [...textures][0].addEventListener('dispose', () => { textureDisposals++; });
  for (const material of materials) {
    material.addEventListener('dispose', () => { materialDisposals++; });
  }
  wake.dispose();
  assert.deepEqual(
    { geometryDisposals, textureDisposals, materialDisposals },
    { geometryDisposals: 1, textureDisposals: 1, materialDisposals: materials.size },
  );
  assert.equal(wake.pool.some((quad) => quad.visible), false,
    'disposed wake left pooled quads visible in the scene');
});
