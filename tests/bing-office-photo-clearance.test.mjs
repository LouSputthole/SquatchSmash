import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../vendor/three.module.min.js';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';
import { measureBingOfficePhotoClearance } from '../tools/bing-office-photo-clearance.mjs';

ensureThreeShim();
ensureDomShim();

const { buildClub } = await import('../src/bing/club.js');

const OFFICE_PHOTO_SLOTS = [
  'bing.office.nephews',
  'bing.office.old_place',
];

function artForSlot(root, slot) {
  let hit = null;
  root.traverse((object) => {
    if (object.userData?.art?.slot === slot) hit = object;
  });
  return hit;
}

test('Lou office photo clearance is measured by semantic slot after portrait art loads', async () => {
  const scene = new THREE.Scene();
  const club = buildClub(scene);
  await club.artReady;

  /* The live manifest supplies 1024x1280 portrait art. Reproduce the loaded
   * geometry without making this headless test depend on image decoding: the
   * club keeps the authored 0.34 m width and derives a 0.425 m height. This is
   * the exact shape that invalidated the verifier's old max-y heuristic. */
  for (const slot of OFFICE_PHOTO_SLOTS) {
    const art = artForSlot(club.root, slot);
    assert.ok(art, `${slot} lost its semantic art target`);
    art.geometry.dispose();
    art.geometry = new THREE.PlaneGeometry(0.34, 0.34 / 0.8);
    art.userData.art.real = true;
  }
  scene.updateMatrixWorld(true);

  const previousWindow = globalThis.window;
  const browserWindow = previousWindow ?? {};
  const previousBing = browserWindow.__bing;
  globalThis.window = browserWindow;
  browserWindow.__bing = { THREE, club };
  try {
    const measured = await measureBingOfficePhotoClearance();
    assert.deepEqual(measured, {
      pictures: 2,
      nephewsOffTheGlass: true,
      nephewsGap: 0.21,
    });
  } finally {
    if (previousBing === undefined) delete browserWindow.__bing;
    else browserWindow.__bing = previousBing;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
