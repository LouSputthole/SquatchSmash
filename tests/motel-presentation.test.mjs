import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { Actor, CAST, buildWeaponMesh } from '../src/motel/actors.js';

test('Rico has a stable face identity and an animated speaking mouth', () => {
  const scene = new THREE.Scene();
  const rico = new Actor(scene, { ...CAST.rico(), x: 0, z: 0, state: 'deal' });
  assert.equal(rico.identity, 'rico');
  assert.equal(rico.rig.faceMesh?.name, 'actor.face.rico');
  assert.equal(rico.rig.mouth?.name, 'actor.mouth');

  rico.talkT = 1;
  rico.update(0.05, {
    player: { x: 0, z: 4 },
    floorAt: () => 0,
    blocked: () => false,
  });
  assert.ok(rico.rig.mouth.scale.y > 1, 'mouth opens while Rico owns a voice turn');
});

test('the first-person revolver reads as a complete gun, not two boxes', () => {
  const revolver = buildWeaponMesh('revolver');
  const parts = new Set();
  revolver.traverse((node) => {
    if (node.name) parts.add(node.name);
  });
  for (const part of ['revolver.barrel', 'revolver.cylinder', 'revolver.grip', 'revolver.muzzle']) {
    assert.equal(parts.has(part), true, `${part} is visible in the held model`);
  }
});
