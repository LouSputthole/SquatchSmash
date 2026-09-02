import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const THREE = await import('three');
const {
  INITIATION_CARD_SLOT,
  INITIATION_ART_SLOTS,
  makeSaintCard,
} = await import('../src/initiation/cabin/props.js');

test('the optimized St. Silver Sasquatch runtime card is registered byte-for-byte', async () => {
  const manifest = JSON.parse(await readFile(
    new URL('../assets/art/manifest.json', import.meta.url),
    'utf8',
  ));
  const entry = manifest.art.find(({ slot }) => slot === INITIATION_CARD_SLOT);
  assert.deepEqual(INITIATION_ART_SLOTS, ['initiation.ceremony.saint-card']);
  assert.equal(entry.file, 'initiation-st-silver-sasquatch-card.png');
  const bytes = await readFile(new URL('../assets/art/initiation-st-silver-sasquatch-card.png', import.meta.url));
  assert.equal(bytes.length, 397_800);
  assert.ok(bytes.length <= 400 * 1024, 'runtime card must stay inside the image budget');
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    'ba204f0e08bfcbe6d29a3087b9fe939d0f5bdf5961f85b66a054957c9944366c',
  );
  assert.equal(bytes.readUInt32BE(16), 624);
  assert.equal(bytes.readUInt32BE(20), 936);
  assert.equal(bytes.readUInt32BE(16) * 3, bytes.readUInt32BE(20) * 2,
    'runtime card must keep the supplied 2:3 portrait aspect');
});

test('the card preserves the portrait aspect and owns a bounded burn lifecycle', () => {
  const card = makeSaintCard();
  const backingSize = new THREE.Vector3();
  card.backing.geometry.computeBoundingBox();
  card.backing.geometry.boundingBox.getSize(backingSize);
  assert.ok(Math.abs(backingSize.x / backingSize.y - 2 / 3) < 1e-6);
  assert.equal(card.burnProgress, 0);
  assert.equal(card.flame.visible, false);
  assert.equal(card.light.intensity, 0);

  const texture = new THREE.Texture();
  assert.equal(card.setTexture(texture), true);
  assert.equal(texture.colorSpace, THREE.SRGBColorSpace);
  assert.equal(texture.wrapS, THREE.ClampToEdgeWrapping);
  assert.equal(texture.wrapT, THREE.ClampToEdgeWrapping);

  card.setBurnProgress(0.5);
  assert.equal(card.burnProgress, 0.5);
  assert.equal(card.char.visible, true);
  assert.equal(card.flame.visible, true);
  assert.ok(card.light.intensity > 0);
  assert.equal(card.embers.visible, true);
  card.setBurnProgress(0.25);
  assert.equal(card.burnProgress, 0.5, 'burn progress cannot reverse accidentally');
  const before = card.flame.rotation.z;
  card.updateBurn(0.1);
  assert.notEqual(card.flame.rotation.z, before);

  card.setBurnProgress(1);
  assert.equal(card.burnProgress, 1);
  assert.equal(card.backing.visible, false);
  assert.equal(card.front.visible, false);
  assert.equal(card.flame.visible, false);
  assert.equal(card.light.intensity, 0);
  assert.equal(card.embers.visible, false);

  card.resetBurn();
  assert.equal(card.burnProgress, 0);
  assert.equal(card.backing.visible, true);
  assert.equal(card.front.visible, true);
  assert.equal(card.light.intensity, 0);
});

test('the card is the right way up in the raised hand', () => {
  /* Owner, 2026-09-02: "The card in your hand is upside down." The grip's
   * pitch compounds with the ritual raise (-1.08 on the upper arm and again
   * on the forearm) to -2.66 rad, so the print faced him upside down; the
   * half turn about the card's own normal is the fix, and an X flip would
   * turn the blank backing to the camera. Modelled here as the same chain:
   * upper arm, forearm, grip. */
  const card = makeSaintCard();
  assert.equal(card.grip.rotation.z, Math.PI);
  const chain = new THREE.Object3D();
  const fore = new THREE.Object3D();
  const hand = new THREE.Object3D();
  chain.rotation.set(-1.08, 0.04, -0.28);
  fore.rotation.set(-1.08, 0, -0.04);
  chain.add(fore);
  fore.add(hand);
  hand.rotation.set(card.grip.rotation.x, card.grip.rotation.y, card.grip.rotation.z);
  chain.updateMatrixWorld(true);
  const up = new THREE.Vector3(0, 1, 0).transformDirection(hand.matrixWorld);
  const normal = new THREE.Vector3(0, 0, 1).transformDirection(hand.matrixWorld);
  assert.ok(up.y > 0.85, `the saint's head points ${up.y.toFixed(2)} of the way up`);
  assert.ok(normal.z < -0.8, 'the print no longer faces the player');
});
