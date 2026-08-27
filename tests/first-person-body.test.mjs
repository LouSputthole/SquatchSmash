import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  FIRST_PERSON_BODY_LAYER,
  FirstPersonBody,
  createPlayerAppearanceStore,
} from '../src/core/first-person-body.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

function figureFactory(created) {
  return (outfitId) => {
    created.push(outfitId);
    const group = new THREE.Group();
    const parts = { group, heightScale: 1 };
    for (const key of ['body', 'head', 'legL', 'legR', 'shinL', 'shinR', 'armL', 'armR', 'foreL', 'foreR', 'handR']) {
      parts[key] = new THREE.Group();
      group.add(parts[key]);
    }
    return parts;
  };
}

test('the shared player body is reflection-only and follows the first-person controller', () => {
  const scene = new THREE.Scene();
  const created = [];
  const body = new FirstPersonBody(scene, {
    factory: figureFactory(created),
    outfitId: 'cabin_workshirt',
  });
  const player = {
    position: new THREE.Vector3(3, 1.76, -4),
    velocity: new THREE.Vector3(0, 0, -2),
    yaw: 0.4,
    ground: 0,
    mode: 'walk',
  };

  assert.deepEqual(created, ['cabin_workshirt']);
  assert.equal(scene.children.includes(body.group), true);
  body.group.traverse((object) => {
    assert.equal(object.layers.isEnabled(FIRST_PERSON_BODY_LAYER), true);
    assert.equal(object.layers.isEnabled(0), false);
  });

  assert.equal(body.update(1 / 60, player), true);
  assert.deepEqual(body.group.position.toArray(), [3, 0, -4]);
  assert.ok(Math.abs(body.group.rotation.y - (0.4 + Math.PI)) < 1e-9);
  assert.notEqual(body.parts.legL.rotation.x, body.parts.legR.rotation.x);

  body.setFirstPersonVisible(true);
  assert.equal(body.group.layers.isEnabled(0), true);
  body.setReflectionVisible(false);
  assert.equal(body.group.visible, true);
  assert.equal(body.group.layers.isEnabled(FIRST_PERSON_BODY_LAYER), false);
  body.setReflectionVisible(true);
  body.setFirstPersonVisible(false);
  assert.equal(body.group.layers.isEnabled(0), false);
});

test('seated pose is stable, returns to standing, and carries a reflected weapon', () => {
  const scene = new THREE.Scene();
  const body = new FirstPersonBody(scene, {
    factory: figureFactory([]),
    outfitId: 'charcoal_suit',
  });
  const player = {
    position: new THREE.Vector3(1, 1.35, 2),
    velocity: new THREE.Vector3(),
    yaw: 0,
    ground: 0,
    mode: 'seated',
  };
  body.update(0, player);
  assert.equal(body.pose, 'seated');
  assert.ok(body.parts.legL.rotation.x < -1);
  assert.ok(body.parts.shinL.rotation.x > 1);
  const firstSeat = body.parts.legL.rotation.x;
  body.update(1, player);
  assert.equal(body.parts.legL.rotation.x, firstSeat, 'a seated body must not pump or drift');

  const pistol = new THREE.Group();
  body.setWeapon(pistol);
  assert.equal(pistol.parent, body.parts.handR);
  assert.equal(pistol.layers.isEnabled(FIRST_PERSON_BODY_LAYER), true);
  assert.equal(pistol.layers.isEnabled(0), false,
    'the reflected weapon must not duplicate the first-person view-model');
  body.setFirstPersonVisible(true);
  assert.equal(pistol.layers.isEnabled(0), true);
  body.setFirstPersonVisible(false);
  player.mode = 'walk';
  body.update(0, player);
  assert.ok(body.parts.armR.rotation.x < -1,
    'a visible reflected weapon raises the supporting arm');
  body.setWeaponVisible(false);
  assert.equal(pistol.visible, false);

  body.update(0, player);
  assert.equal(body.pose, 'standing');
  assert.equal(body.parts.shinL.rotation.x, 0);
  assert.equal(body.parts.foreR.rotation.x, 0);
});

test('outfit changes rebuild once and persist for the next scene', () => {
  const storage = new MemoryStorage();
  const store = createPlayerAppearanceStore({ storage });
  const scene = new THREE.Scene();
  const created = [];
  const body = new FirstPersonBody(scene, { factory: figureFactory(created), store });

  assert.equal(body.outfitId, 'charcoal_suit');
  assert.equal(body.setOutfit('late-night_track_jacket'), true);
  assert.equal(body.setOutfit('late-night_track_jacket'), false);
  assert.deepEqual(created, ['charcoal_suit', 'late-night_track_jacket']);
  assert.equal(store.read(), 'late-night_track_jacket');

  const nextScene = new FirstPersonBody(new THREE.Scene(), {
    factory: figureFactory(created),
    store,
  });
  assert.equal(nextScene.outfitId, 'late-night_track_jacket');
});

test('blocked browser storage cannot prevent the reflection body from booting', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() { throw new Error('storage denied'); },
    });
    const store = createPlayerAppearanceStore();
    assert.equal(store.read(), 'charcoal_suit');
    assert.doesNotThrow(() => store.write('cabin_workshirt'));
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
});
