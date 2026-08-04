import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

/* props.js bakes its canvas textures at module load, so give Node just enough
 * of a canvas to get through the import. Nothing here reads a pixel. */
globalThis.document ??= {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_t, key) => (key === 'createLinearGradient' || key === 'createRadialGradient'
        ? () => ({ addColorStop() {} })
        : key === 'getImageData'
          ? () => ({ data: new Uint8ClampedArray(4) })
          : () => {}),
      set: () => true,
    }),
  }),
};

const { ITEMS } = await import('../src/core/inventory.js');
const { makeHeldDrinks, makeMilkJug } = await import('../src/world/props.js');

/*
 * The raw milk is a gag with a job.
 *
 * The job is that the morning's other bathroom errand needs a cause, and the
 * only two causes the flat had were a cigarette and a nicotine pouch -- both
 * of which a player can reasonably decline for a whole morning, leaving a
 * required chore with no visible way to trigger it. The fridge is the first
 * place anybody looks, so the third cause lives in the fridge.
 */
test('the raw milk is a jug that stands on its base with a cream line in it', () => {
  const jug = makeMilkJug({}, { x: 1, y: 2, z: 3 });
  jug.group.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(jug.group);
  // Placed BY ITS BASE, like every other shelf prop, or it floats.
  assert.ok(Math.abs(box.min.y - 2) < 0.01, `base at ${box.min.y.toFixed(3)}`);
  assert.ok(Math.abs(box.max.y - jug.top) < 0.02, 'reported top matches the geometry');
  // Half a gallon in glass: about 29cm tall and about 11cm across.
  assert.ok(box.max.y - box.min.y > 0.25 && box.max.y - box.min.y < 0.32);
  assert.ok(box.max.x - box.min.x < 0.14);

  /* Unhomogenised, so it has separated. The cream sits above the milk and
   * below the shoulder, and that band is the only thing in the geometry that
   * says this is raw rather than a jug of ordinary milk. */
  const heights = [];
  jug.group.traverse((object) => {
    if (!object.isMesh) return;
    const at = new THREE.Vector3();
    object.getWorldPosition(at);
    heights.push({ colour: object.material.color.getHex(), y: at.y });
  });
  const cream = heights.find((m) => m.colour === 0xf6e9c4);
  const milk = heights.find((m) => m.colour === 0xfbf7ea);
  assert.ok(cream, 'no cream line');
  assert.ok(milk, 'no milk');
  assert.ok(cream.y > milk.y, 'the cream has settled underneath the milk');
});

test('the held drinks rig can show a jug as well as a can and a bottle', () => {
  const held = makeHeldDrinks({});
  assert.ok(held.can && held.bottle && held.jug);
  // All three start away, and each is its own object so poseDrink can pick one.
  assert.equal(held.jug.visible, false);
  assert.notEqual(held.jug, held.bottle);
  assert.ok(held.group.children.includes(held.jug));
});

test('milk is a carryable item with its own hold hint', () => {
  assert.ok(ITEMS.milk);
  assert.match(ITEMS.milk.hint, /\[F\]/);
  assert.notEqual(ITEMS.milk.name, ITEMS.beer.name);
});
