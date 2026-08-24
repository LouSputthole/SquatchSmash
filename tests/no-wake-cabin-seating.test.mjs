import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const THREE = await import('three');
const { buildNoWakeWorld } = await import('../src/nowake/world.js');
const { BOOSKI_NO_WAKE, IRISH, IRISH_NO_WAKE } = await import('../src/core/wardrobe.js');
const {
  CABIN,
  CABIN_COLLIDERS,
  CABIN_CONCAVE_FIXTURE_CHANNELS,
  CABIN_CAST_STAGING,
  CAPSULE_RADIUS,
  DECK,
  cabinColliderBoxes,
  deckPenetration,
  narrowChannels,
} = await import('../src/nowake/deck-collision.js');

function poseAtMark(npc, mark) {
  npc.group.position.set(mark.x, mark.baseY, mark.z);
  npc.group.rotation.set(0, mark.yaw, 0);
  npc.baseY = mark.baseY;
  npc.job = mark.job;
  npc._syncJob(true);
}

function isShown(object) {
  for (let node = object; node; node = node.parent) {
    if (node.visible === false) return false;
  }
  const materials = (Array.isArray(object.material) ? object.material : [object.material])
    .filter(Boolean);
  return materials.length === 0 || materials.some((material) => (
    material.visible !== false && (material.opacity ?? 1) > 0.01
  ));
}

function visibleMeshBoxes(group) {
  const meshes = [];
  group.traverse((object) => {
    if (object.isMesh && isShown(object)) {
      meshes.push({ object, box: new THREE.Box3().setFromObject(object) });
    }
  });
  return meshes;
}

function positiveVolumeContacts(a, b, epsilon = 1e-6) {
  const contacts = [];
  for (const left of visibleMeshBoxes(a)) {
    for (const right of visibleMeshBoxes(b)) {
      const overlap = left.box.clone().intersect(right.box);
      if (overlap.isEmpty()) continue;
      const size = overlap.getSize(new THREE.Vector3());
      if (size.x <= epsilon || size.y <= epsilon || size.z <= epsilon) continue;
      contacts.push({
        a: left.object.name || '(unnamed mesh)',
        b: right.object.name || '(unnamed mesh)',
        size: size.toArray().map((value) => Number(value.toFixed(6))),
      });
    }
  }
  return contacts;
}

function triangleBoxContacts(actor, fixture) {
  const fixtureBoxes = visibleMeshBoxes(fixture)
    .filter(({ object }) => /galley (cabinet carcass|counter top|counter fiddle rail)/.test(object.name));
  const contacts = new Set();
  for (const { object } of visibleMeshBoxes(actor)) {
    const position = object.geometry?.getAttribute?.('position');
    if (!position) continue;
    const index = object.geometry.index;
    object.updateWorldMatrix(true, false);
    const at = (triangleIndex, corner) => {
      const vertexIndex = index ? index.getX(triangleIndex * 3 + corner) : triangleIndex * 3 + corner;
      return new THREE.Vector3().fromBufferAttribute(position, vertexIndex).applyMatrix4(object.matrixWorld);
    };
    const triangles = (index?.count ?? position.count) / 3;
    for (let triangleIndex = 0; triangleIndex < triangles; triangleIndex++) {
      const triangle = new THREE.Triangle(
        at(triangleIndex, 0), at(triangleIndex, 1), at(triangleIndex, 2),
      );
      for (const fixtureMesh of fixtureBoxes) {
        if (fixtureMesh.box.intersectsTriangle(triangle)) {
          contacts.add(`${object.name} -> ${fixtureMesh.object.name}`);
        }
      }
    }
  }
  return [...contacts].sort();
}

test('Willy sits forward on the aft return without touching Uncle Lou', () => {
  const world = buildNoWakeWorld(new THREE.Scene());
  const { boat } = world;
  poseAtMark(boat.cast.lou, CABIN_CAST_STAGING.lou);
  poseAtMark(boat.cast.willy, CABIN_CAST_STAGING.willySeat);
  boat.root.updateMatrixWorld(true);

  assert.equal(CABIN_CAST_STAGING.willySeat.x, 1.20);
  assert.equal(CABIN_CAST_STAGING.willySeat.z, -3.05);
  assert.equal(CABIN_CAST_STAGING.willySeat.yaw, Math.PI);
  assert.equal(boat.cast.willy.baseY, CABIN_CAST_STAGING.willySeat.baseY);
  assert.deepEqual(
    positiveVolumeContacts(boat.cast.willy.group, boat.cast.lou.group),
    [],
    'Willy and Uncle Lou still occupy the same visible space',
  );

  const hips = new THREE.Box3().setFromObject(boat.cast.willy.group.getObjectByName('hips'));
  const support = new THREE.Box3().setFromObject(
    boat.cabin.group.getObjectByName('dinette booth cushion · aft return'),
  );
  assert.ok(hips.min.x >= support.min.x && hips.max.x <= support.max.x,
    `Willy's hips are not fully over the aft return in X: ${JSON.stringify({ hips, support })}`);
  assert.ok(hips.min.z >= support.min.z && hips.max.z <= support.max.z,
    `Willy's hips are not fully over the aft return in Z: ${JSON.stringify({ hips, support })}`);
  const supportGap = hips.min.y - support.max.y;
  assert.ok(supportGap >= -1e-6 && supportGap <= 0.025,
    `Willy's hips hover ${supportGap.toFixed(6)} m above the aft return`);
});

test('Willy has a real legwell instead of intersecting the booth or table', () => {
  const world = buildNoWakeWorld(new THREE.Scene());
  const { boat } = world;
  poseAtMark(boat.cast.willy, CABIN_CAST_STAGING.willySeat);
  boat.root.updateMatrixWorld(true);

  const dinette = boat.cabin.group.getObjectByName('curved dinette');
  const contacts = positiveVolumeContacts(boat.cast.willy.group, dinette)
    .filter((contact) => !/aft return/.test(contact.b));
  assert.deepEqual(contacts, [],
    'non-support booth/table geometry still passes through seated Willy');
});

test('Booski stands beside the galley instead of passing visible triangles through it', () => {
  const world = buildNoWakeWorld(new THREE.Scene());
  const { boat } = world;
  poseAtMark(boat.cast.booski, CABIN_CAST_STAGING.booski);
  poseAtMark(boat.cast.lou, CABIN_CAST_STAGING.lou);
  poseAtMark(boat.cast.willy, CABIN_CAST_STAGING.willyStanding);
  boat.root.updateMatrixWorld(true);

  assert.equal(CABIN_CAST_STAGING.booski.x, -0.95);
  assert.equal(CABIN_CAST_STAGING.booski.z, -4.60);
  assert.equal(CABIN_CAST_STAGING.booski.yaw, 1.42);
  assert.equal(CABIN_CAST_STAGING.booski.job, 'stand');
  const galley = boat.cabin.group.getObjectByName('galley and wet bar');
  const contacts = triangleBoxContacts(boat.cast.booski.group, galley);
  assert.deepEqual(contacts, [], `Booski intersects the built galley:\n${contacts.join('\n')}`);
  assert.deepEqual(positiveVolumeContacts(boat.cast.booski.group, boat.cast.lou.group), [],
    'moving Booski clear of the galley put him into Uncle Lou');
  assert.deepEqual(positiveVolumeContacts(boat.cast.booski.group, boat.cast.willy.group), [],
    'moving Booski clear of the galley put him into standing Willy');
});

test('NO WAKE builds Booski in the relaxed boat variant without changing his identity', () => {
  const world = buildNoWakeWorld(new THREE.Scene());
  const booski = world.boat.cast.booski;
  assert.equal(booski.group.userData.characterId, 'booski');
  assert.deepEqual({
    outfit: booski.parts.profile.outfit,
    height: booski.parts.profile.height,
    neckline: booski.parts.profile.neckline,
    luxury: booski.parts.profile.luxury,
    watch: booski.parts.profile.watch,
    chain: booski.parts.profile.chainStyle,
    pendant: booski.parts.profile.pendantStyle,
  }, {
    outfit: BOOSKI_NO_WAKE.dress,
    height: BOOSKI_NO_WAKE.height,
    neckline: 'crew',
    luxury: false,
    watch: 'gold',
    chain: 'layered',
    pendant: 'crest',
  });
  for (const part of [
    'person.face.photo-skull', 'camp.undershirt', 'camp.front.left',
    'camp.front.right', 'camp.collar.left', 'camp.collar.right',
  ]) assert.ok(booski.group.getObjectByName(part), `runtime Booski has no ${part}`);
  for (const part of ['shirt.neckline.v', 'shirt.luxury.rib', 'camp.pattern.tile']) {
    assert.equal(booski.group.getObjectByName(part), undefined, `runtime Booski leaked ${part}`);
  }
});

test('NO WAKE keeps canonical Irish on the bow in his lookout wardrobe', () => {
  const world = buildNoWakeWorld(new THREE.Scene());
  const irish = world.boat.cast.irish;

  assert.equal(irish.group.userData.characterId, 'irish');
  assert.notStrictEqual(IRISH_NO_WAKE, IRISH, 'the scene wardrobe must not replace canonical Irish');
  for (const field of ['height', 'build', 'hair', 'hairColour', 'beard', 'skin']) {
    assert.equal(IRISH_NO_WAKE[field], IRISH[field], `NO WAKE changed Irish's canonical ${field}`);
  }
  assert.deepEqual({
    outfit: irish.parts.profile.outfit,
    height: irish.parts.profile.height,
    build: irish.parts.profile.build,
  }, {
    outfit: 'shirt',
    height: IRISH.height,
    build: IRISH.build,
  });
  assert.ok(irish.group.getObjectByName('person.face.photo-skull'), 'runtime Irish lost his photo face');

  for (const part of [
    'workvest.front.left', 'workvest.front.right',
    'workvest.strap.left', 'workvest.strap.right',
    'workvest.pocket', 'workvest.pocket.flap', 'shirt.placket',
  ]) assert.ok(irish.group.getObjectByName(part), `runtime Irish has no ${part}`);
  assert.equal(
    irish.group.getObjectByName('workvest.front.left.cloth').material.color.getHex(),
    0x1b304c,
    'Irish no longer has the navy open vest',
  );
  assert.equal(
    irish.group.getObjectByName('ribcage').material.color.getHex(),
    0x29402f,
    'Irish no longer has the green shirt under the vest',
  );
  assert.equal(
    irish.group.getObjectByName('thigh').material.color.getHex(),
    0x20242a,
    'Irish no longer has dark trousers',
  );

  assert.deepEqual(irish.group.position.toArray(), [1.75, DECK.foredeckHeight, -4.55],
    'Irish moved off his established starboard bow lookout mark');
  const binoculars = irish.parts.foreR.getObjectByName('Irish binoculars');
  assert.ok(binoculars, 'Irish lost his binoculars');
  assert.equal(binoculars.parent, irish.parts.foreR, 'the binoculars moved off Irish\'s right forearm');
  assert.deepEqual(binoculars.position.toArray(), [0, -0.3, -0.1],
    'the binocular socket offset changed');
});

test('the notched visible dinette and its player colliders are the same layout', () => {
  const world = buildNoWakeWorld(new THREE.Scene());
  const { boat } = world;
  boat.root.updateMatrixWorld(true);
  const boatInverse = boat.root.matrixWorld.clone().invert();
  const colliderByName = new Map(CABIN_COLLIDERS.map((entry) => [entry.name, entry]));
  const layouts = [
    ['cabin · dinette booth · outboard spine', [
      'dinette booth base · outboard spine',
      'dinette booth cushion · outboard spine',
    ]],
    ['cabin · dinette booth · forward inboard remnant', [
      'dinette booth base · forward inboard remnant',
      'dinette booth cushion · forward inboard remnant',
    ]],
    ['cabin · dinette booth · forward return', [
      'dinette booth base · forward return',
      'dinette booth cushion · forward return',
    ]],
    ['cabin · dinette booth · aft return support', [
      'dinette booth base · aft return',
      'dinette booth cushion · aft return',
    ]],
    ['cabin · dinette booth backrest', ['dinette booth back rest']],
    ['cabin · dinette table pedestal', ['dinette table pedestal']],
    ['cabin · dinette table top', ['dinette table top']],
  ];

  for (const [colliderName, meshNames] of layouts) {
    const collider = colliderByName.get(colliderName);
    assert.ok(collider, `missing player collider ${colliderName}`);
    const visible = new THREE.Box3();
    visible.makeEmpty();
    for (const meshName of meshNames) {
      const object = boat.cabin.group.getObjectByName(meshName);
      assert.ok(object, `missing visible cabin mesh ${meshName}`);
      visible.union(new THREE.Box3().setFromObject(object).applyMatrix4(boatInverse));
    }
    const actual = [...collider.min, ...collider.max];
    const expected = [...visible.min.toArray(), ...visible.max.toArray()];
    assert.ok(actual.every((value, index) => Math.abs(value - expected[index]) <= 1e-6),
      `${colliderName} does not match its visible geometry: ${JSON.stringify({ actual, expected })}`);
  }

  assert.deepEqual(
    narrowChannels(CABIN_COLLIDERS),
    CABIN_CONCAVE_FIXTURE_CHANNELS.map(({ reason: _reason, ...channel }) => channel),
    'the dinette reblock created an unclassified player-width squeeze',
  );
  const boxes = cabinColliderBoxes();
  for (let z = -4.75; z <= -2.50; z += 0.05) {
    const penetration = deckPenetration(
      boxes, 0, z, CAPSULE_RADIUS, CABIN.height + 1.66, 1.66,
    );
    assert.ok(penetration.depth <= 1e-6,
      `the cabin centre route hits ${penetration.name} by ${penetration.depth.toFixed(6)} m at z ${z.toFixed(2)}`);
  }
});

test('the dinette table is carried by its pedestal with matching player geometry', () => {
  const world = buildNoWakeWorld(new THREE.Scene());
  const { boat } = world;
  boat.root.updateMatrixWorld(true);

  const visiblePedestal = new THREE.Box3().setFromObject(
    boat.cabin.group.getObjectByName('dinette table pedestal'),
  );
  const visibleTop = new THREE.Box3().setFromObject(
    boat.cabin.group.getObjectByName('dinette table top'),
  );
  const visibleGap = visibleTop.min.y - visiblePedestal.max.y;

  const pedestalCollider = CABIN_COLLIDERS.find(({ name }) => name.endsWith('table pedestal'));
  const topCollider = CABIN_COLLIDERS.find(({ name }) => name.endsWith('table top'));
  assert.ok(pedestalCollider && topCollider, 'dinette table lost its public collider pair');
  const colliderGap = topCollider.min[1] - pedestalCollider.max[1];

  assert.ok(visibleGap >= -0.005 && visibleGap <= 0.005,
    `dinette table pedestal leaves a ${(visibleGap * 1000).toFixed(1)} mm air gap`);
  assert.ok(Math.abs(colliderGap - visibleGap) <= 1e-6,
    `table collider gap ${(colliderGap * 1000).toFixed(1)} mm does not match visible gap ${(visibleGap * 1000).toFixed(1)} mm`);
});
