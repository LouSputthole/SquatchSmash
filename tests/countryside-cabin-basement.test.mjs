import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';
import { groundAt as propertyGroundAt } from '../src/cabin/field.js';
import {
  CABIN_BASEMENT,
  resolveCabinFloor,
} from '../src/cabin/basement.js';

ensureDomShim();
ensureThreeShim();

const [
  { buildCountrysideCabin },
  { InteractionSystem },
  THREE,
] = await Promise.all([
  import('../src/cabin/world.js'),
  import('../src/core/interaction.js'),
  import('three'),
]);

test('the hidden cabin basement resolves below the same footprint without stealing the upstairs floor', () => {
  const x = 0;
  const z = 0;

  assert.equal(resolveCabinFloor(x, z, 0, propertyGroundAt), 0);
  assert.equal(
    resolveCabinFloor(x, z, CABIN_BASEMENT.floorY, propertyGroundAt),
    CABIN_BASEMENT.floorY,
  );
  assert.equal(
    resolveCabinFloor(CABIN_BASEMENT.x1 + 1, z, CABIN_BASEMENT.floorY, propertyGroundAt),
    propertyGroundAt(CABIN_BASEMENT.x1 + 1, z),
  );
});

test('pushing the wardrobe hangers aside reveals the one basement transition', async () => {
  const registered = new Map();
  const discoveries = [];
  const transitions = [];
  const cabin = await buildCountrysideCabin({
    scene: new THREE.Scene(),
    externalLighting: true,
    interaction: { register(target, descriptor) { registered.set(target, descriptor); } },
    onDiscover: (id) => discoveries.push(id),
    onBasementTransition: (direction) => transitions.push(direction),
  });

  const wardrobe = registered.get(cabin.utilityTargets.wardrobe);
  const entrance = registered.get(cabin.utilityTargets.basementEntrance);
  assert.equal(cabin.basement.panelArt, cabin.closet.picture, 'closet.back stays on the concealed panel');
  assert.ok(cabin.basement.entryAssembly.getObjectByName('cabin-basement-upper-shaft-mouth'));
  assert.ok(cabin.basement.entryAssembly.getObjectByName('cabin-basement-upper-ladder-rung-4'));
  assert.equal(entrance.enabled(), false, 'the clothes conceal the panel while hanging normally');

  wardrobe.onUse();
  assert.deepEqual(discoveries, [], 'ordinary clothes use does not retire the basement clue');
  assert.equal(entrance.enabled(), false, 'the target waits for the hangers to clear physically');
  cabin.update(1, 1, new THREE.Vector3());
  assert.equal(entrance.enabled(), true);

  entrance.onUse();
  assert.deepEqual(discoveries, ['basement']);
  assert.deepEqual(transitions, ['down']);
  assert.equal(cabin.basement.discovered, true);

  registered.get(cabin.utilityTargets.basementExit).onUse();
  assert.deepEqual(discoveries, ['basement'], 'returning upstairs does not rediscover the room');
  assert.deepEqual(transitions, ['down', 'up']);

  cabin.dispose();
});

test('paired basement spawns remain grounded and isolated from the opposite storey', async () => {
  const cabin = await buildCountrysideCabin({
    scene: new THREE.Scene(),
    externalLighting: true,
    interaction: { register(target, descriptor) { target.userData.interact = descriptor; } },
  });
  const down = cabin.spawns.basement;
  const up = cabin.spawns.wardrobeReturn;

  assert.equal(down, cabin.basement.spawns.down);
  assert.equal(up, cabin.basement.spawns.up);
  for (const spawn of [down, up]) {
    assert.ok(Number.isFinite(spawn.yaw) && Number.isFinite(spawn.pitch));
    assert.equal(spawn.position.y, spawn.floorY + 1.66);
    assert.equal(cabin.groundAt(spawn.position.x, spawn.position.z, spawn.floorY), spawn.floorY);
  }

  const capsuleAt = (spawn) => new THREE.Box3(
    new THREE.Vector3(spawn.position.x - 0.30, spawn.floorY, spawn.position.z - 0.30),
    new THREE.Vector3(spawn.position.x + 0.30, spawn.position.y + 0.12, spawn.position.z + 0.30),
  );
  const lowerNames = new Set(cabin.colliders
    .filter(({ name }) => name.startsWith('cabin-basement-'))
    .map(({ name }) => name));
  assert.ok(lowerNames.size >= 8, 'the lower room needs authored shell and furnishing collision');
  assert.deepEqual(
    cabin.colliders.filter((volume) => lowerNames.has(volume.name) && volume.intersectsBox(capsuleAt(up))),
    [],
    'basement collision cannot block an upstairs player in the same X/Z column',
  );
  assert.deepEqual(
    cabin.colliders.filter((volume) => !lowerNames.has(volume.name) && volume.intersectsBox(capsuleAt(up))),
    [],
    'the square-on wardrobe return and reveal pose must be clear of upstairs collision',
  );
  assert.deepEqual(
    cabin.colliders.filter((volume) => !lowerNames.has(volume.name) && volume.intersectsBox(capsuleAt(down))),
    [],
    'upstairs cabin props cannot block the basement arrival pose',
  );

  cabin.update(0.016, 1, up.position);
  assert.deepEqual(cabin.basement.lights.map(({ intensity }) => intensity), [0, 0],
    'lower utility lights cannot leak into the cabin or property');
  assert.equal(cabin.basement.fillLight.intensity, 0);
  const creek = new THREE.Vector3(4, propertyGroundAt(4, -31.45) + 1.66, -31.45);
  assert.ok(creek.y - 1.66 < CABIN_BASEMENT.levelSplitY,
    'the creek regression stance must remain below the basement height split');
  cabin.update(0.016, 1.5, creek);
  assert.deepEqual(cabin.basement.lights.map(({ intensity }) => intensity), [0, 0],
    'low exterior terrain cannot impersonate basement occupancy');
  assert.equal(cabin.basement.fillLight.intensity, 0);
  cabin.update(0.016, 2, down.position);
  assert.deepEqual(cabin.basement.lights.map(({ intensity }) => intensity), [2.1, 2.1],
    'the same authored fixtures light the room while Tony is downstairs');
  assert.equal(cabin.basement.fillLight.intensity, 0.78,
    'a small warm fill makes the storage dressing readable only downstairs');

  cabin.dispose();
});

test('the cleared wardrobe gives the live interaction ray to the concealed panel', async () => {
  const camera = new THREE.PerspectiveCamera(68, 1, 0.045, 100);
  const hud = { showPrompt() {}, hidePrompt() {}, setHold() {} };
  const registered = new Map();
  const cabin = await buildCountrysideCabin({
    scene: new THREE.Scene(),
    camera,
    externalLighting: true,
    interaction: { register(target, descriptor) { registered.set(target, descriptor); } },
  });
  const interaction = new InteractionSystem(camera, hud);
  assert.ok(cabin.closet.picture, 'the real closet.back picture is available for ray arbitration');
  interaction.register(
    cabin.closet.picture,
    registered.get(cabin.utilityTargets.wardrobe),
  );
  interaction.register(
    cabin.utilityTargets.basementEntrance,
    registered.get(cabin.utilityTargets.basementEntrance),
  );

  registered.get(cabin.utilityTargets.wardrobe).onUse();
  cabin.update(1, 1, new THREE.Vector3());
  const view = cabin.interactionViewpoints.basementEntrance;
  camera.position.copy(view.position);
  camera.lookAt(view.lookAt);
  camera.updateMatrixWorld(true);
  interaction.update(0);

  assert.equal(interaction.current, cabin.utilityTargets.basementEntrance);
  assert.ok(camera.position.distanceTo(view.lookAt) <= 2.7);

  cabin.dispose();
});
