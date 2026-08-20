import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const THREE = await import('three');
const { Npc } = await import('../src/bing/cast.js');

function skirtBounds(npc) {
  npc.group.updateMatrixWorld(true);
  const skirt = npc.group.getObjectByName('gown.skirt');
  assert.ok(skirt, 'the reusable gown skirt is present');
  return new THREE.Box3().setFromObject(skirt);
}

test('a dining-chair gown rests at the floor instead of passing through it', () => {
  const npc = new Npc(new THREE.Scene(), {
    name: 'Silver seated-gown regression',
    tier: 'hero',
    job: 'sit',
    look: false,
    model: {
      height: 1.69,
      build: 1.06,
      dress: 'gown',
      shirt: 0x1a2a4a,
      gender: 'female',
      bodyShape: 'curvy',
    },
  });

  const seated = skirtBounds(npc);
  assert.ok(seated.min.y >= -0.001, `seated gown enters floor by ${(-seated.min.y).toFixed(3)}m`);
  assert.ok(seated.min.y <= 0.025, 'seated gown should still visually meet the floor');

  npc.stand();
  const standing = skirtBounds(npc);
  assert.ok(standing.min.y > 0.15, 'standing gown keeps its authored ankle-height hem');

  npc.sit();
  const reseated = skirtBounds(npc);
  assert.ok(Math.abs(reseated.min.y - seated.min.y) < 1e-9, 'sit/stand gown staging is reversible');
});
