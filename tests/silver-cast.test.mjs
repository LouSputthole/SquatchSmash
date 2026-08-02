import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { populate } from '../src/silver/cast.js';

const point = (x = 0, z = 0, y = 0) => ({ x, y, z });

function roomFixture() {
  return {
    anchors: {
      serviceDoor: point(0, 0), doorman: point(1, 0), smoker: point(2, 0),
      cellarman: point(3, 0), cellarMid: point(4, 0), drystore: point(5, 0),
      chef: point(6, 0), prepCook: point(7, 0), hotPan: point(8, 0),
      dishwasher: point(9, 0), porter: point(10, 0), serviceBar: point(11, 0),
      coatCheck: point(12, 0), host: point(13, 0), tableStaging: point(14, 0),
      stageCentre: point(0, -20),
      tableSeats: [
        { x: -12, z: 1, seats: [point(-13, 1), point(-11, 1)] },
        { x: -9, z: 2, seats: [point(-10, 2), point(-8, 2)] },
      ],
      crewSeats: [point(-9, 1), point(-8, 1), point(-9, 2), point(-8, 2)],
    },
  };
}

test('diners behind the date keep their attention on their own tables', () => {
  const originalRandom = Math.random;
  const originalDocument = globalThis.document;
  Math.random = () => 0.5;
  /* Texture loading is the browser boundary. The cast test only needs the
   * returned texture object, not an image decode. */
  globalThis.document = {
    createElementNS: () => ({
      addEventListener() {},
      removeEventListener() {},
      set src(_value) {},
    }),
  };
  try {
    const cast = populate(new THREE.Scene(), roomFixture());
    const diners = Object.entries(cast.byName)
      .filter(([key]) => key.startsWith('diner'))
      .map(([, diner]) => diner);
    assert.ok(diners.length > 0);
    assert.ok(diners.every((diner) => diner.look === false));
  } finally {
    Math.random = originalRandom;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});
