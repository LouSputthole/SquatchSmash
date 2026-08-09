import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { ensureThreeShim, ensureDomShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const { CartPair } = await import('../src/golf/carts.js');
const { createHeldProps, dressGolfCartConsumables } = await import('../src/golf/hands.js');
const { GOLF_EFFECT_CUES } = await import('../src/golf/audio.js');

test('Silver Pines preloads every apartment cigarette effect it reuses', () => {
  for (const cue of ['cig.pack', 'cig.light', 'cig.drag', 'cig.exhale', 'cig.stub']) {
    assert.ok(GOLF_EFFECT_CUES.includes(cue), `${cue} must be resident before control`);
  }
});

test('Silver Pines cart amenities use the apartment beer, cigarette, and Zyn builders', () => {
  const scene = new THREE.Scene();
  const carts = new CartPair(scene);
  const amenities = carts.lead.amenities;

  const dressed = dressGolfCartConsumables(amenities);

  assert.deepEqual(dressed, { beers: 4, cigarettes: 1, zyn: 1 });
  assert.equal(amenities.cigarettes.userData.reusableProp, 'cigarette-pack');
  assert.equal(amenities.zyn.userData.reusableProp, 'zyn-tin');
  assert.ok(amenities.cigarettes.getObjectByName('cigs'), 'the apartment cigarette pack is mounted');
  assert.ok(amenities.zyn.getObjectByName('zyn'), 'the apartment Zyn tin is mounted');
  assert.ok(amenities.beers.every((can) => can.userData.reusableProp === 'squatch-beer'));
  assert.ok(amenities.beers.every((can) => can.getObjectByName(`${can.name}-cap`)));
});

test('a dressed cart beer keeps the apartment can dimensions instead of unit geometry', () => {
  const scene = new THREE.Scene();
  const carts = new CartPair(scene);
  const can = carts.lead.amenities.beers[0];

  dressGolfCartConsumables(carts.lead.amenities);
  can.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(can).getSize(new THREE.Vector3());

  assert.ok(Math.abs(size.x - 0.066) < 0.002, `beer width ${size.x}`);
  assert.ok(Math.abs(size.y - 0.127) < 0.002, `beer height ${size.y}`);
  assert.ok(Math.abs(size.z - 0.066) < 0.002, `beer depth ${size.z}`);
});

test('redressing stocked cart consumables preserves props without allocating scene resources', () => {
  const scene = new THREE.Scene();
  const carts = new CartPair(scene);
  const amenities = carts.lead.amenities;
  dressGolfCartConsumables(amenities);

  const mounted = {
    cigarettes: amenities.cigarettes.getObjectByName('cigs'),
    zyn: amenities.zyn.getObjectByName('zyn'),
    beerGeometry: amenities.beers.map((can) => can.geometry),
    beerMaterial: amenities.beers.map((can) => can.material),
    beerCaps: amenities.beers.map((can) => can.getObjectByName(`${can.name}-cap`)),
  };
  const materialFence = new THREE.MeshBasicMaterial();
  const geometryFence = new THREE.BufferGeometry();

  const redressed = dressGolfCartConsumables(amenities);

  const nextMaterial = new THREE.MeshBasicMaterial();
  const nextGeometry = new THREE.BufferGeometry();
  assert.deepEqual(redressed, { beers: 4, cigarettes: 1, zyn: 1 });
  assert.strictEqual(amenities.cigarettes.getObjectByName('cigs'), mounted.cigarettes);
  assert.strictEqual(amenities.zyn.getObjectByName('zyn'), mounted.zyn);
  assert.deepEqual(amenities.beers.map((can) => can.geometry), mounted.beerGeometry);
  assert.deepEqual(amenities.beers.map((can) => can.material), mounted.beerMaterial);
  assert.deepEqual(
    amenities.beers.map((can) => can.getObjectByName(`${can.name}-cap`)),
    mounted.beerCaps,
  );
  assert.equal(nextMaterial.id, materialFence.id + 1, 'the no-op pass creates no materials');
  assert.equal(nextGeometry.id, geometryFence.id + 1, 'the no-op pass creates no geometries');

  materialFence.dispose();
  geometryFence.dispose();
  nextMaterial.dispose();
  nextGeometry.dispose();
});

test('the golf held Zyn is the reusable apartment tin rather than a local cylinder', () => {
  const camera = new THREE.PerspectiveCamera();
  const held = createHeldProps(camera);

  assert.equal(held.tin.userData.reusableProp, 'zyn-tin');
  assert.ok(held.tin.getObjectByName('zyn'));
  assert.equal(held.tin.getObjectByName('golf-held-zyn-tin-body'), undefined);
});

test('Silver Pines samples the apartment beer-to-mouth pose exactly', () => {
  const camera = new THREE.PerspectiveCamera();
  const held = createHeldProps(camera);
  held.show('beer');
  held.poseDrink(1);

  assert.ok(Math.abs(held.drinks.can.position.x - (-0.10)) < 1e-9);
  assert.ok(Math.abs(held.drinks.can.position.y - 0.26) < 1e-9);
  assert.ok(Math.abs(held.drinks.can.position.z - 0.09) < 1e-9);
  assert.ok(Math.abs(held.drinks.can.rotation.x - 1.95) < 1e-9);
  assert.ok(Math.abs(held.drinks.can.rotation.z - 0.34) < 1e-9);
});
