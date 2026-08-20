import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';
import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const {
  BLOOD_MARK_NAME,
  BLOOD_POOL_NAME,
  BLOOD_SPURT_NAME,
  BloodImpactSystem,
  BloodSpurtSystem,
  DeathBloodPool,
} = await import('../src/world/blood.js');

function closeVector(actual, expected, epsilon = 0.006) {
  assert.ok(
    actual.distanceTo(expected) <= epsilon,
    `expected ${actual.toArray()} within ${epsilon} of ${expected.toArray()}`,
  );
}

test('blood impact uses the ray hit point and stays attached to the moving body', () => {
  const scene = new THREE.Scene();
  const actorRoot = new THREE.Group();
  actorRoot.position.set(3, 0.2, -4);
  scene.add(actorRoot);

  const torsoAnchor = new THREE.Group();
  torsoAnchor.position.set(0, 1.1, 0);
  actorRoot.add(torsoAnchor);
  scene.updateMatrixWorld(true);

  const actor = { id: 'test-actor' };
  const actualHit = torsoAnchor.localToWorld(new THREE.Vector3(0.28, 0.18, -0.25));
  const guessedChest = actorRoot.position.clone().add(new THREE.Vector3(0, 1.28, 0));
  assert.ok(actualHit.distanceTo(guessedChest) > 0.2, 'fixture must distinguish a real hit from a guessed chest point');

  const blood = new BloodImpactSystem(scene, { random: () => 0.5 });
  const { wound } = blood.hit({
    actor,
    anchor: torsoAnchor,
    point: actualHit,
    normal: new THREE.Vector3(0, 0, -1),
    spatter: false,
  });

  assert.equal(wound.name, BLOOD_MARK_NAME);
  assert.equal(wound.parent, torsoAnchor);
  closeVector(wound.getWorldPosition(new THREE.Vector3()), actualHit);
  assert.ok(
    wound.getWorldPosition(new THREE.Vector3()).distanceTo(guessedChest) > 0.19,
    'the shared adapter regressed to the Mansion chest guess',
  );
  assert.equal(blood.marksOn(actor), 1);

  const beforeMove = wound.getWorldPosition(new THREE.Vector3());
  actorRoot.position.x += 1.75;
  actorRoot.rotation.y = 0.35;
  scene.updateMatrixWorld(true);
  const afterMove = wound.getWorldPosition(new THREE.Vector3());
  assert.ok(afterMove.distanceTo(beforeMove) > 1.5, 'the wound stayed behind in world space');

  blood.clearActor(actor);
  assert.equal(blood.marksOn(actor), 0);
  assert.equal(wound.visible, false);
});

test('a recycled wound belongs only to its current actor', () => {
  const scene = new THREE.Scene();
  const blood = new BloodImpactSystem(scene, { random: () => 0.5 });
  const actors = [];

  for (let i = 0; i < 9; i++) {
    const anchor = new THREE.Group();
    anchor.position.set(i, 1, 0);
    scene.add(anchor);
    scene.updateMatrixWorld(true);
    const actor = { id: `actor-${i}` };
    actors.push(actor);
    blood.hit({
      actor,
      anchor,
      point: new THREE.Vector3(i, 1.2, 0),
      normal: new THREE.Vector3(0, 0, 1),
      spatter: false,
    });
  }

  assert.equal(blood.marksOn(actors[0]), 0, 'the recycled decal still answered to its old owner');
  assert.equal(blood.marksOn(actors[8]), 1);
  assert.equal(blood.clearActor(actors[0]), false,
    'the recycled owner kept an empty ledger entry');
  assert.equal(blood.marksOn(actors[8]), 1, 'clearing an old owner hid the recycled live wound');
});

test('repeated hits on one actor keep a bounded, duplicate-free wound ledger', () => {
  const scene = new THREE.Scene();
  const anchor = new THREE.Group();
  scene.add(anchor);
  scene.updateMatrixWorld(true);
  const actor = { id: 'repeat-target' };
  const blood = new BloodImpactSystem(scene, { random: () => 0.5 });

  for (let i = 0; i < blood.wounds.pool.length * 4; i++) {
    blood.hit({
      actor,
      anchor,
      point: new THREE.Vector3(0, 1 + i * 0.001, 0),
      normal: new THREE.Vector3(0, 0, 1),
      spatter: false,
    });
  }

  assert.equal(blood.marksOn(actor), blood.wounds.pool.length);
  assert.equal(blood._marks.get(actor).size, blood.wounds.pool.length);
  assert.equal(blood.clearActor(actor), true);
  assert.equal(blood.wounds.pool.filter((mark) => mark.visible).length, 0);
});

test('spurts arc into the air, land on the explicit floor, and stay bounded', () => {
  /* The HotDog Incident's stabbing beat (2026-08-19 owner note: "Blood
   * splatting into the air") is the reason this emitter exists: arterial
   * droplets thrown UP off the wound, pulled back down, and reported to the
   * caller where they land so a splatter decal can be put there. */
  const scene = new THREE.Scene();
  const spurts = new BloodSpurtSystem(scene, { capacity: 6, random: () => 0.5 });

  const wound = new THREE.Vector3(2, 1.3, -1);
  const landings = [];
  const launched = spurts.burst(wound, new THREE.Vector3(0, 0, -1), {
    count: 4,
    floorY: 0.1,
    onLand: (x, z) => landings.push({ x, z }),
  });
  assert.equal(launched, 4);
  assert.equal(spurts.airborneCount, 4);
  const droplet = spurts._entries[0].mesh;
  assert.equal(droplet.name, `${BLOOD_SPURT_NAME}.01`);
  assert.equal(droplet.userData.reusableSystem, 'blood');
  assert.equal(droplet.userData.bloodEffect, 'spurt');
  assert.equal(droplet.visible, true);

  // Rises first — the whole point is blood in the AIR, not a decal.
  spurts.update(0.05);
  assert.ok(droplet.position.y > wound.y, 'the droplet never went up');

  // Then falls, lands at the explicit floor height, and reports where.
  for (let i = 0; i < 100 && spurts.airborneCount > 0; i++) spurts.update(0.05);
  assert.equal(spurts.airborneCount, 0, 'droplets never came back down');
  assert.equal(landings.length, 4, 'landings were not reported to the caller');
  assert.ok(landings.every(({ x, z }) => Number.isFinite(x) && Number.isFinite(z)));
  assert.ok(spurts._entries.every((entry) => entry.mesh.visible === false));

  // A burst bigger than the pool recycles instead of allocating.
  assert.equal(spurts.burst(wound, new THREE.Vector3(0, 0, -1), { count: 40 }), 6);
  assert.equal(spurts.airborneCount, 6);
  spurts.reset();
  assert.equal(spurts.airborneCount, 0);
});

test('death pools use an explicit floor point, grow deterministically, and stay bounded', () => {
  const scene = new THREE.Scene();
  const pools = new DeathBloodPool(scene, {
    capacity: 2,
    growthSeconds: 1,
    random: () => 0.25,
  });

  const woundPoint = new THREE.Vector3(2, 1.65, -3);
  const first = pools.spill(woundPoint, { floorY: 0.01, size: 0.8, opacity: 0.88, seed: 7 });
  assert.equal(first.name, `${BLOOD_POOL_NAME}.01`);
  assert.equal(first.userData.reusableSystem, 'blood');
  assert.equal(first.userData.bloodEffect, 'death-pool');
  assert.equal(first.position.x, woundPoint.x);
  assert.equal(first.position.z, woundPoint.z);
  assert.ok(Math.abs(first.position.y - 0.016) < 1e-9, 'the pool was left at wound height');
  assert.equal(first.material.opacity, 0);
  assert.ok(Math.abs(first.scale.x - 0.44) < 1e-9);

  pools.update(0.5);
  assert.ok(Math.abs(first.material.opacity - 0.44) < 1e-9);
  assert.ok(Math.abs(first.scale.x - 0.62) < 1e-9);

  const second = pools.spill(new THREE.Vector3(4, 0, -2), { floorY: 0 });
  const recycled = pools.spill(new THREE.Vector3(6, 0, -1), { floorY: 0 });
  assert.notEqual(second, first);
  assert.equal(recycled, first, 'the bounded pool allocated instead of recycling');
  assert.equal(pools.visibleCount, 2);

  pools.reset();
  assert.equal(pools.visibleCount, 0);
  assert.ok(pools.meshes.every((mesh) => mesh.visible === false));
});
