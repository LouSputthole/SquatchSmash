import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const { buildSilentSquatch } = await import('../src/mansion/scenes/SilentSquatch.js');

function collectNamed(root, name) {
  const out = [];
  root.traverse((object) => {
    if (object.name === name) out.push(object);
  });
  return out;
}

function cylinderSpan(piece) {
  const height = piece.geometry?.parameters?.height * (piece.scale?.y ?? 1);
  assert.ok(Number.isFinite(height), `${piece.name} is not a cylinder with a measurable height`);
  return [piece.position.y - height / 2, piece.position.y + height / 2];
}

function connected(a, b, tolerance = 0.006) {
  const [, a1] = cylinderSpan(a);
  const [b0] = cylinderSpan(b);
  return Math.abs(b0 - a1) <= tolerance;
}

test('cellar racks hold complete named wine bottles rather than anonymous cylinders', () => {
  const built = buildSilentSquatch();
  built.root.updateMatrixWorld(true);
  const bottles = collectNamed(built.root, 'cellar-wine-bottle');

  assert.equal(bottles.length, 48, 'the two four-by-six cellar racks should hold 48 complete bottles');
  assert.equal(built.lab.innocent?.wine?.bottles?.length, 48,
    'the browser walkthrough cannot inspect the live cellar bottle inventory');
  const glassColours = new Set();
  const labelColours = new Set();

  for (const bottle of bottles) {
    const body = bottle.getObjectByName('cellar-wine-bottle-body');
    const shoulder = bottle.getObjectByName('cellar-wine-bottle-shoulder');
    const neck = bottle.getObjectByName('cellar-wine-bottle-neck');
    const cork = bottle.getObjectByName('cellar-wine-bottle-cork');
    const label = bottle.getObjectByName('cellar-wine-bottle-label');
    assert.ok(body && shoulder && neck && cork && label,
      'a cellar bottle is missing its body, shoulder, neck, cork, or label');

    assert.ok(connected(body, shoulder), 'wine-bottle shoulder floats above its body');
    assert.ok(connected(shoulder, neck), 'wine-bottle neck floats above its shoulder');
    assert.ok(connected(neck, cork), 'wine-bottle cork floats above its neck');
    const [body0, body1] = cylinderSpan(body);
    const [label0, label1] = cylinderSpan(label);
    assert.ok(label0 >= body0 && label1 <= body1,
      'the wine label is not wrapped around the bottle body');

    assert.ok(Math.abs(Math.abs(bottle.rotation.z) - Math.PI / 2) <= 0.001,
      'a racked wine bottle is standing like a cylinder instead of lying in its bay');
    const box = new THREE.Box3().setFromObject(bottle);
    const size = box.getSize(new THREE.Vector3());
    assert.ok(size.x >= 0.32 && size.x <= 0.36,
      `wine bottle length ${size.x.toFixed(3)} m is not human-scaled`);
    assert.ok(size.y >= 0.10 && size.y <= 0.13 && size.z >= 0.10 && size.z <= 0.13,
      `wine bottle diameter ${size.y.toFixed(3)} x ${size.z.toFixed(3)} m is distorted`);

    glassColours.add(body.material?.color?.getHex?.());
    labelColours.add(label.material?.color?.getHex?.());
    assert.notEqual(body.material, label.material,
      'the label reuses the glass material and cannot read as paper');
  }

  assert.ok(glassColours.size >= 2, 'all cellar bottles use one undifferentiated glass colour');
  assert.ok(labelColours.size >= 2, 'all cellar bottles use one undifferentiated label colour');
});
