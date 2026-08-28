import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';
import { groundAt as propertyGroundAt } from '../src/cabin/field.js';
import { mountArmory } from '../src/core/weapons/Armory.js';
import {
  CABIN_BASEMENT,
  CABIN_CAPTIVE_IDS,
  CABIN_DUNGEON,
  CABIN_DUNGEON_CLEANUP_LAYOUT,
  CABIN_DUNGEON_CORRIDOR,
  CABIN_DUNGEON_DOOR,
  cabinDungeonCeilingAt,
  cabinDungeonFloorAt,
  insideCabinDungeon,
  insideCabinLowerLevel,
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
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(68, 1, 0.045, 100);
  scene.add(camera);
  const registered = new Map();
  const discoveries = [];
  const transitions = [];
  const cabin = await buildCountrysideCabin({
    scene,
    camera,
    externalLighting: true,
    interaction: { register(target, descriptor) { registered.set(target, descriptor); } },
    canRevealBasement: () => true,
    onDiscover: (id) => discoveries.push(id),
    onBasementTransition: (direction, detail) => transitions.push({ direction, detail }),
  });

  const wardrobe = registered.get(cabin.utilityTargets.wardrobe);
  const entrance = registered.get(cabin.utilityTargets.basementEntrance);
  assert.equal(cabin.basement.panelArt, cabin.closet.picture, 'closet.back stays on the concealed panel');
  assert.ok(cabin.basement.panelPivot, 'the concealed art needs an authored moving panel');
  assert.notEqual(cabin.basement.movingPanelArt, cabin.closet.picture,
    'the animated panel uses a clone instead of stealing the wardrobe owner art');
  assert.equal(cabin.basement.movingPanelArt.parent, cabin.basement.panelPivot,
    'the cloned art moves with the concealed panel');
  assert.equal(cabin.basement.panelLightLeak?.name, 'cabin-basement-panel-light-leak');
  assert.equal(cabin.basement.panelLightLeak?.visible, false,
    'the closed wardrobe cannot leak reveal lighting into the bedroom');
  assert.ok(cabin.basement.entryAssembly.getObjectByName('cabin-basement-upper-shaft-mouth'));
  assert.ok(cabin.basement.entryAssembly.getObjectByName('cabin-basement-upper-ladder-rung-4'));
  assert.equal(entrance.enabled(), false, 'the clothes conceal the panel while hanging normally');

  wardrobe.onUse();
  assert.deepEqual(discoveries, [], 'ordinary clothes use does not retire the basement clue');
  assert.equal(entrance.enabled(), false, 'the target waits for the hangers to clear physically');
  cabin.update(1, 1, new THREE.Vector3());
  assert.equal(entrance.enabled(), true);
  assert.ok(Math.abs(cabin.basement.panelPivot.rotation.y - (-0.92)) <= 0.02,
    'the cleared hangers swing the concealed panel visibly toward its authored open angle');
  assert.equal(cabin.basement.panelLightLeak.visible, true,
    'opening the concealed panel reveals the warm ladder-shaft light leak');

  entrance.onLook();
  assert.deepEqual(discoveries, ['basement']);
  entrance.onUse();
  assert.deepEqual(discoveries, ['basement']);
  assert.equal(transitions[0].direction, 'down');
  assert.equal(transitions[0].detail?.firstEntry, true,
    'seeing the panel is discovery, but the first descent is still the first entry');
  assert.equal(cabin.basement.discovered, true);

  const carriedBodyId = Object.keys(cabin.bodyCleanup.snapshot().bodies)[0];
  assert.equal(cabin.bodyCleanup.wrap(carriedBodyId), true);
  assert.equal(cabin.bodyCleanup.beginCarry(carriedBodyId), true);
  assert.equal(cabin.bodyCleanup.bodies.get(carriedBodyId).group.parent, camera);
  assert.equal(cabin.basement.dungeon.setHeldTool('pliers'), 'pliers');
  registered.get(cabin.utilityTargets.basementExit).onUse();
  assert.equal(cabin.bodyCleanup.snapshot().carryingId, carriedBodyId,
    'the wardrobe ladder cannot silently drop a camera-carried body');
  assert.equal(cabin.bodyCleanup.bodies.get(carriedBodyId).group.parent, camera);
  assert.equal(cabin.basement.dungeon.heldToolId, 'pliers',
    'the level transition cannot silently discard the currently held tool');
  entrance.onUse();
  assert.equal(cabin.bodyCleanup.snapshot().carryingId, carriedBodyId,
    'repeat descent preserves the same carry rather than cloning or resetting it');
  assert.deepEqual(discoveries, ['basement'], 'returning upstairs does not rediscover the room');
  assert.deepEqual(transitions.map(({ direction }) => direction), ['down', 'up', 'down']);
  assert.equal(transitions[2].detail?.firstEntry, false,
    'repeat descents must not replay first-discovery feedback');

  cabin.dispose();
});

test('the stocked basement gives three authored props real inspect interactions', async () => {
  const camera = new THREE.PerspectiveCamera(68, 1, 0.045, 100);
  const hud = { showPrompt() {}, hidePrompt() {}, setHold() {} };
  const registered = new Map();
  const inspections = [];
  const cabin = await buildCountrysideCabin({
    scene: new THREE.Scene(),
    camera,
    externalLighting: true,
    interaction: { register(target, descriptor) { registered.set(target, descriptor); } },
    onBasementInspect: (id) => inspections.push(id),
  });
  const interaction = new InteractionSystem(camera, hud);
  interaction.setOccluders(cabin.occluders ?? []);

  const contracts = [
    ['basementWorkbench', 'workbench'],
    ['basementShelves', 'shelves'],
    ['basementCot', 'cot'],
  ];
  assert.deepEqual(Object.keys(cabin.basement.inspectionViewpoints).sort(),
    contracts.map(([targetId]) => targetId).sort());

  for (const [targetId, inspectionId] of contracts) {
    const target = cabin.utilityTargets[targetId];
    const descriptor = registered.get(target);
    const viewpoint = cabin.basement.inspectionViewpoints[targetId];
    assert.ok(target, `${targetId} is published as a utility target`);
    assert.equal(typeof descriptor?.onUse, 'function', `${targetId} has a usable interaction`);
    assert.equal(cabin.interactionViewpoints[targetId], viewpoint,
      `${targetId} publishes its authored approach through the cabin world`);
    assert.ok(viewpoint?.position?.isVector3 && viewpoint?.lookAt?.isVector3,
      `${targetId} has a complete position/look-at viewpoint`);
    assert.ok(viewpoint.position.distanceTo(viewpoint.lookAt) <= 2.7,
      `${targetId} remains inside the live interaction ray range`);

    interaction.register(target, descriptor);
    camera.position.copy(viewpoint.position);
    camera.lookAt(viewpoint.lookAt);
    camera.updateMatrixWorld(true);
    interaction.update(0);
    assert.equal(interaction.current, target, `${targetId} owns the real centre interaction ray`);
    interaction.press();
    assert.equal(inspections.at(-1), inspectionId);
  }
  assert.deepEqual(inspections, ['workbench', 'shelves', 'cot']);

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
    .filter(({ name }) => name?.startsWith('cabin-basement-'))
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
  assert.deepEqual(cabin.basement.lights.map(({ intensity }) => intensity), [3, 3],
    'the same authored fixtures light the room while Tony is downstairs');
  assert.equal(cabin.basement.fillLight.intensity, 1.35,
    'a readable warm fill reveals the storage dressing only while Tony is downstairs');

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
    canRevealBasement: () => true,
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

test('the first secret stays visually and interactively absent until the Gratin reveal gate opens', async () => {
  const registered = new Map();
  const discoveries = [];
  const transitions = [];
  let revealAllowed = false;
  const cabin = await buildCountrysideCabin({
    scene: new THREE.Scene(),
    externalLighting: true,
    interaction: { register(target, descriptor) { registered.set(target, descriptor); } },
    canRevealBasement: () => revealAllowed,
    onDiscover: (id) => discoveries.push(id),
    onBasementTransition: (...args) => transitions.push(args),
  });
  const wardrobe = registered.get(cabin.utilityTargets.wardrobe);
  const entrance = registered.get(cabin.utilityTargets.basementEntrance);

  assert.equal(cabin.basement.panelArt.visible, true,
    'before the call, the original fixed closet.back art still seals the wardrobe');
  assert.equal(cabin.basement.entryAssembly.visible, false);
  assert.equal(cabin.basement.movingPanelArt.visible, false);
  assert.equal(cabin.basement.entryTarget.visible, false);
  wardrobe.onUse();
  cabin.update(1, 1, new THREE.Vector3());
  assert.equal(cabin.state.closetOpen, true, 'opening the ordinary wardrobe remains available before the call');
  assert.equal(entrance.enabled(), false);
  assert.equal(entrance.onLook(), false);
  assert.equal(entrance.onUse(), false);
  assert.deepEqual(discoveries, []);
  assert.deepEqual(transitions, []);
  assert.equal(cabin.basement.discovered, false);
  assert.ok(Math.abs(cabin.basement.panelPivot.rotation.y) < 1e-12);

  revealAllowed = true;
  cabin.update(0.25, 1.25, new THREE.Vector3());
  assert.equal(cabin.basement.panelArt.visible, false);
  assert.equal(cabin.basement.entryAssembly.visible, true);
  assert.equal(cabin.basement.movingPanelArt.visible, true);
  assert.equal(cabin.basement.entryTarget.visible, true);
  assert.equal(entrance.enabled(), true);
  entrance.onLook();
  assert.deepEqual(discoveries, ['basement']);
  assert.equal(cabin.basement.discovered, true);

  cabin.dispose();
});

test('the lower-floor contract keeps the cellar datum and follows the buried connector ramp', () => {
  const baseGroundAt = () => 12.5;
  const points = [
    [0, 0, CABIN_BASEMENT.floorY],
    [(CABIN_DUNGEON_CORRIDOR.x0 + CABIN_DUNGEON_CORRIDOR.x1) / 2, 6.4, cabinDungeonFloorAt(0.92, 6.4)],
    [0, 14.2, CABIN_DUNGEON.floorY],
  ];

  for (const [x, z, expectedFloor] of points) {
    assert.equal(insideCabinLowerLevel(x, z), true);
    assert.equal(resolveCabinFloor(x, z, expectedFloor, baseGroundAt), expectedFloor);
  }
  assert.equal(cabinDungeonFloorAt(0.92, CABIN_DUNGEON_CORRIDOR.z0), CABIN_BASEMENT.floorY);
  assert.equal(cabinDungeonFloorAt(0.92, CABIN_DUNGEON_CORRIDOR.z1), CABIN_DUNGEON.floorY);
  assert.equal(cabinDungeonCeilingAt(0.92, CABIN_DUNGEON_CORRIDOR.z0), CABIN_BASEMENT.ceilingY);
  assert.equal(cabinDungeonCeilingAt(0.92, CABIN_DUNGEON_CORRIDOR.z1), CABIN_DUNGEON.ceilingY);
  assert.equal(insideCabinDungeon(0.92, 6.4), true);
  assert.equal(insideCabinDungeon(0, 14.2), true);
  assert.equal(insideCabinDungeon(-12, 14.2), false);
  assert.equal(resolveCabinFloor(0, 14.2, 0, baseGroundAt), 12.5,
    'the dungeon footprint cannot steal the outdoor/upstairs floor above the height split');
  assert.equal(resolveCabinFloor(0, 20, -1.45, baseGroundAt), 12.5,
    'low trail terrain over the bunker still remains above the dungeon height split');
});

test('the second cellar door is concealed, campaign-gated, animated, and removes its live collision', async () => {
  const registered = new Map();
  const doorEvents = [];
  let allowed = false;
  const cabin = await buildCountrysideCabin({
    scene: new THREE.Scene(),
    externalLighting: true,
    interaction: {
      register(target, descriptor) { registered.set(target, descriptor); },
      unregister(target) { registered.delete(target); },
    },
    canOpenDungeonDoor: () => allowed,
    onDungeonDoor: (action, detail) => doorEvents.push({ action, detail }),
  });
  const { dungeon } = cabin.basement;
  const descriptor = registered.get(dungeon.targets.door);
  const liveDoorCollider = dungeon.door.collider;

  assert.ok(cabin.basement.root.getObjectByName('cabin-basement-wall-south-west'));
  assert.ok(cabin.basement.root.getObjectByName('cabin-basement-wall-south-east'));
  assert.ok(cabin.basement.root.getObjectByName('cabin-basement-wall-south-lintel'));
  assert.equal(cabin.basement.root.getObjectByName('cabin-basement-wall-south'), undefined,
    'the former solid south wall must not plug the authored door aperture');
  assert.ok(dungeon.root.getObjectByName('cabin-dungeon-secret-door-leaf'));
  assert.equal(descriptor.enabled(), false);
  assert.match(descriptor.label(), /cellar masonry/i);
  assert.equal(descriptor.onUse(), false);
  assert.equal(dungeon.door.t, 0);
  assert.equal(dungeon.door.colliderLive, true);
  assert.ok(cabin.colliders.includes(liveDoorCollider));

  allowed = true;
  assert.equal(descriptor.enabled(), true);
  assert.match(descriptor.label(), /second concealed door/i);
  assert.equal(descriptor.onUse(), true);
  for (let index = 0; index < 8; index += 1) {
    dungeon.update(0.1, index * 0.1, dungeon.spawns.entry.position);
  }
  assert.ok(dungeon.door.t > 0.99);
  assert.ok(dungeon.door.root.position.x < CABIN_DUNGEON_DOOR.x0,
    'the masonry leaf slides fully into its west wall pocket');
  assert.equal(dungeon.door.colliderLive, false);
  assert.equal(cabin.colliders.includes(liveDoorCollider), false);
  assert.deepEqual(doorEvents.map(({ action }) => action), ['open', 'open']);
  assert.deepEqual(doorEvents.map(({ detail }) => detail.allowed), [false, true]);

  const playerCapsule = (z) => {
    const floorY = cabinDungeonFloorAt(0.92, z) ?? CABIN_BASEMENT.floorY;
    return new THREE.Box3(
      new THREE.Vector3(0.67, floorY, z - 0.25),
      new THREE.Vector3(1.17, floorY + 1.80, z + 0.25),
    );
  };
  for (const z of [4.86, 5.60, 6.80, 8.42, 9.35]) {
    const blockers = cabin.colliders.filter((volume) => (
      volume.name?.startsWith('cabin-basement-wall-south')
      || volume.name?.startsWith('cabin-dungeon-')
    ) && volume.intersectsBox(playerCapsule(z)));
    assert.deepEqual(blockers, [], `the central cellar-to-dungeon route is clear at z=${z}`);
  }

  dungeon.setDoorOpen(false);
  for (let index = 0; index < 8; index += 1) dungeon.update(0.1, 2 + index * 0.1, null);
  assert.equal(dungeon.door.t, 0);
  assert.equal(dungeon.door.colliderLive, true);
  assert.ok(cabin.colliders.includes(liveDoorCollider));

  cabin.basement.dispose();
  cabin.dispose();
});

test('the live shared armory leaves a continuous player-radius route down the ramp and clear debug poses', async () => {
  const cabin = await buildCountrysideCabin({
    scene: new THREE.Scene(),
    externalLighting: true,
    interaction: { register() {}, unregister() {} },
  });
  const armoryColliders = [];
  const armory = mountArmory({
    parent: cabin.basement.dungeon.root,
    system: {
      equipped: null,
      firearm: () => ({ rounds: 0, capacity: 1, reserve: 0 }),
    },
    interaction: { register() {}, unregister() {} },
    racks: cabin.basement.dungeon.armory.racks,
    addCollider: (x0, x1, y0, y1, z0, z1) => {
      const volume = new THREE.Box3(
        new THREE.Vector3(x0, y0, z0),
        new THREE.Vector3(x1, y1, z1),
      );
      armoryColliders.push(volume);
      cabin.colliders.push(volume);
    },
  });

  cabin.basement.dungeon.setDoorOpen(true);
  for (let index = 0; index < 8; index += 1) {
    cabin.basement.dungeon.update(0.1, index * 0.1, null);
  }

  const playerCapsule = (x, z) => {
    const floorY = cabinDungeonFloorAt(x, z) ?? CABIN_DUNGEON.floorY;
    return new THREE.Box3(
      new THREE.Vector3(x - 0.30, floorY, z - 0.30),
      new THREE.Vector3(x + 0.30, floorY + 1.80, z + 0.30),
    );
  };
  const blocked = (x, z) => cabin.colliders.some((volume) => volume.intersectsBox(playerCapsule(x, z)));
  const route = [
    [1.08, 4.88],
    [1.08, 6.42],
    [0.98, 6.68],
    [0.86, 6.77],
    [0.72, 7.10],
    [0.72, 8.54],
    [0.92, 9.24],
  ];
  for (let index = 1; index < route.length; index += 1) {
    const [x0, z0] = route[index - 1];
    const [x1, z1] = route[index];
    for (let sample = 0; sample <= 20; sample += 1) {
      const t = sample / 20;
      const x = THREE.MathUtils.lerp(x0, x1, t);
      const z = THREE.MathUtils.lerp(z0, z1, t);
      assert.equal(blocked(x, z), false,
        `the mounted armory blocks the authored ramp route at ${x.toFixed(2)},${z.toFixed(2)}`);
    }
  }

  for (const pose of [cabin.basement.dungeon.spawns.entry, cabin.basement.dungeon.viewpoints.dungeonArmory]) {
    assert.equal(blocked(pose.position.x, pose.position.z), false,
      `${pose.id} must not place the Player capsule inside a live armory collider`);
  }
  assert.deepEqual(Object.keys(armory.report()).sort(), ['ak47', 'barrett']);
  assert.equal(armoryColliders.length, 2);

  armory.dispose();
  cabin.dispose();
});

test('the Cabin dungeon carries the full grim dressing and publishes empty shared-armory mounts', async () => {
  const cabin = await buildCountrysideCabin({
    scene: new THREE.Scene(),
    externalLighting: true,
    interaction: { register() {} },
  });
  const { dungeon } = cabin.basement;
  const requiredNames = [
    'cabin-dungeon-drainage-gulley',
    'cabin-dungeon-water-main-1',
    'cabin-dungeon-wall-conduit-1',
    'cabin-dungeon-light-rack-tube',
    'cabin-dungeon-security-camera',
    'cabin-dungeon-blood-stain-1',
    'cabin-dungeon-rack-bed',
    'cabin-dungeon-rack-strap-chest',
    'cabin-dungeon-overhead-beam',
    'cabin-dungeon-ankle-hook-1',
    'cabin-dungeon-pliers',
    'cabin-dungeon-car-battery',
    'cabin-dungeon-electrical-lead-1',
    'cabin-dungeon-medical-saw',
    'cabin-dungeon-syringe-1',
    'cabin-dungeon-folded-towel-1',
    'cabin-dungeon-bucket',
    'cabin-dungeon-gas-can-body',
    'cabin-dungeon-cell-west-bench',
    'cabin-dungeon-cell-east-bench',
    'cabin-dungeon-cell-west-water-cup',
  ];
  for (const name of requiredNames) {
    assert.ok(dungeon.root.getObjectByName(name), `${name} is part of the authored room`);
  }
  assert.ok(dungeon.root.getObjectByName('cabin-dungeon-cell-west-bar-0'));
  assert.ok(dungeon.root.getObjectByName('cabin-dungeon-cell-east-bar-0'));
  assert.deepEqual(dungeon.armory.racks.map(({ id }) => id).sort(), ['ak47', 'barrett']);
  assert.equal(dungeon.armory.anchor.isObject3D, true);
  assert.equal(dungeon.root.getObjectByName('ak47'), undefined,
    'the environment publishes mount specs, not a second weapon runtime');
  assert.equal(dungeon.root.getObjectByName('barrett'), undefined);
  assert.deepEqual(Object.keys(dungeon.tools).sort(), [
    'battery', 'bucket', 'gasCan', 'leads', 'overhead', 'pliers', 'rack',
    'saw', 'syringes', 'towels', 'worktable',
  ]);
  assert.equal(dungeon.bounds.dungeon, CABIN_DUNGEON);
  assert.equal(cabin.basement.spawns.dungeon, dungeon.spawns.room);
  assert.equal(cabin.basement.spawns.dungeonEntry, dungeon.spawns.entry);
  assert.equal(dungeon.cleanup.layout, CABIN_DUNGEON_CLEANUP_LAYOUT);
  assert.deepEqual(Object.keys(dungeon.cleanup.layout.dungeon).sort(), [
    'a-team-member', 'counterstrike-player',
  ]);

  dungeon.root.updateMatrixWorld(true);
  for (const name of [
    'cabin-dungeon-ceiling',
    'cabin-dungeon-wall-west',
    'cabin-dungeon-wall-east',
    'cabin-dungeon-wall-south',
  ]) {
    const bounds = new THREE.Box3().setFromObject(dungeon.root.getObjectByName(name));
    for (const x of [bounds.min.x, (bounds.min.x + bounds.max.x) / 2, bounds.max.x]) {
      for (const z of [bounds.min.z, (bounds.min.z + bounds.max.z) / 2, bounds.max.z]) {
        assert.ok(propertyGroundAt(x, z) - bounds.max.y >= 0.15,
          `${name} needs honest earth cover at ${x.toFixed(2)},${z.toFixed(2)}`);
      }
    }
  }

  cabin.basement.dispose();
  cabin.dispose();
});

test('occupied dungeon keeps both cleanup stations readable through the failing rack light', async () => {
  const cabin = await buildCountrysideCabin({
    scene: new THREE.Scene(),
    externalLighting: true,
    interaction: { register() {} },
  });
  const { dungeon } = cabin.basement;
  const cleanupLights = new Map([
    ['counterstrike-player', dungeon.root.getObjectByName('cabin-dungeon-cleanup-light-counterstrike')],
    ['a-team-member', dungeon.root.getObjectByName('cabin-dungeon-cleanup-light-ateam')],
  ]);

  dungeon.update(0.016, 0, dungeon.spawns.room.position);
  assert.equal(dungeon.root.getObjectByName('cabin-dungeon-light-rack-light').intensity, 0,
    'elapsed zero deliberately exercises the authored failing-tube blackout');
  dungeon.root.updateMatrixWorld(true);

  for (const [bodyId, light] of cleanupLights) {
    assert.equal(light?.isPointLight, true, `${bodyId} has a localized task light`);
    assert.ok(light.intensity >= 4.5 && light.intensity <= 6.5,
      `${bodyId} task light stays readable without flattening the room`);
    assert.ok(light.distance <= 8, `${bodyId} task light remains local to the dungeon station`);
    assert.ok(dungeon.lights.includes(light), `${bodyId} task light participates in occupancy gating`);

    const station = CABIN_DUNGEON_CLEANUP_LAYOUT.dungeon[bodyId];
    const bodyCentre = new THREE.Vector3(station.x, station.y + 0.48, station.z);
    const lightPosition = light.getWorldPosition(new THREE.Vector3());
    assert.ok(lightPosition.distanceTo(bodyCentre) < light.distance * 0.55,
      `${bodyId} cleanup body stays well inside its stable light pool`);
  }

  dungeon.update(0.016, 0.5, null);
  for (const light of cleanupLights.values()) {
    assert.equal(light.intensity, 0, 'localized task lighting cannot leak outdoors while unoccupied');
  }

  cabin.dispose();
});

test('Gratin and two Cabin-local disposable captives expose restrained pose, hit, sync, and callbacks', async () => {
  const registered = new Map();
  const events = [];
  const gratinEvents = [];
  const captiveEvents = [];
  const toolEvents = [];
  const cabin = await buildCountrysideCabin({
    scene: new THREE.Scene(),
    externalLighting: true,
    interaction: {
      register(target, descriptor) { registered.set(target, descriptor); },
      unregister(target) { registered.delete(target); },
    },
    onDungeonInteract: (event) => events.push(event),
    onDungeonGratin: (...args) => gratinEvents.push(args),
    onDungeonCaptive: (...args) => captiveEvents.push(args),
    onDungeonTool: (...args) => toolEvents.push(args),
  });
  const { dungeon } = cabin.basement;
  const { gratin, ateam, counterStrike } = dungeon.actors;

  assert.equal(gratin.characterId, 'gratin');
  assert.equal(gratin.group.name, 'cabin-dungeon-gratin');
  assert.equal(ateam.npc.name, 'A-Team captive');
  assert.equal(counterStrike.npc.name, 'Counter-Strike baiter');
  assert.equal(ateam.cleanupBodyId, 'a-team-member');
  assert.equal(counterStrike.cleanupBodyId, 'counterstrike-player');
  assert.ok(ateam.npc.parts.body.getObjectByName('cabin.dungeon.ateam.colours.0'));
  assert.ok(counterStrike.npc.parts.head.getObjectByName('cabin-dungeon-cs-headset'));
  assert.equal(dungeon.root.getObjectByName('xXx'), undefined);

  for (const actor of [ateam, counterStrike]) {
    const tagged = [];
    actor.group.traverse((part) => tagged.push(part.userData.cabinCaptiveId));
    assert.ok(tagged.length > 10);
    assert.ok(tagged.every((id) => id === actor.id), `${actor.id} owns every descendant tag`);
    assert.equal(actor.bodyAnchor.userData.cabinCaptiveId, actor.id);
    assert.equal(actor.headAnchor.userData.cabinCaptiveId, actor.id);
  }
  assert.equal(dungeon.hitTargets.length, 4);
  assert.deepEqual(
    dungeon.hitTargets.map(({ userData }) => [userData.cabinCaptiveId, userData.cabinCaptiveHitZone]),
    [
      [CABIN_CAPTIVE_IDS.ATEAM, 'body'],
      [CABIN_CAPTIVE_IDS.ATEAM, 'head'],
      [CABIN_CAPTIVE_IDS.COUNTER_STRIKE, 'body'],
      [CABIN_CAPTIVE_IDS.COUNTER_STRIKE, 'head'],
    ],
  );

  assert.equal(ateam.speak(1.2), true);
  assert.equal(counterStrike.speak(1.2), true);
  dungeon.update(0.016, 1, dungeon.spawns.room.position);
  assert.ok(Math.abs(ateam.group.rotation.x + Math.PI / 2) < 1e-6);
  assert.ok(Math.abs(Math.abs(counterStrike.group.rotation.z) - Math.PI) < 0.12);
  assert.equal(ateam.npc.voiceMouth.mouth, ateam.npc.parts.mouth,
    'the rack pose leaves the audio-driven mouth bound');
  assert.equal(counterStrike.npc.voiceMouth.mouth, counterStrike.npc.parts.mouth,
    'the hanging pose leaves the audio-driven mouth bound');
  counterStrike.group.updateMatrixWorld(true);
  const hangingBounds = new THREE.Box3().setFromObject(counterStrike.group);
  assert.ok(hangingBounds.min.y >= CABIN_DUNGEON.floorY - 0.08,
    'the upside-down captive hangs from his ankles without passing through the floor');

  ateam.flinch(0.9);
  dungeon.sync({
    captives: {
      ateam: { pain: 0.8 },
      counterStrike: { dead: true, cause: 'test-shot' },
    },
  });
  assert.equal(ateam.snapshot.pain, 0.8);
  assert.equal(ateam.blood.visible, true);
  assert.equal(counterStrike.snapshot.dead, true);
  assert.equal(counterStrike.snapshot.cause, 'test-shot');
  counterStrike.setWrapped(true);
  assert.equal(counterStrike.group.visible, false);
  assert.equal(counterStrike.wrap, null);
  assert.equal(ateam.wrap, null);
  assert.equal(dungeon.root.getObjectByName('cabin-dungeon-counterStrike-body-wrap'), undefined);
  assert.equal(dungeon.root.getObjectByName('cabin-dungeon-ateam-body-wrap'), undefined,
    'only the canonical body-cleanup prefabs may present wrapped corpses');

  registered.get(dungeon.targets.gratin).onUse();
  registered.get(dungeon.targets.ateam).onUse();
  registered.get(dungeon.targets.tools.worktable).onUse();
  assert.deepEqual(events.map(({ kind, id }) => [kind, id]), [
    ['gratin', 'gratin'],
    ['captive', CABIN_CAPTIVE_IDS.ATEAM],
    ['tool', 'worktable'],
  ]);
  assert.equal(gratinEvents.length, 1);
  assert.deepEqual(captiveEvents[0].slice(0, 2), [CABIN_CAPTIVE_IDS.ATEAM, 'use']);
  assert.deepEqual(toolEvents[0].slice(0, 2), ['worktable', 'use']);
  for (const id of [
    'dungeonDoor', 'dungeonGratin', 'dungeonAteamCaptive',
    'dungeonCounterStrikeCaptive', 'dungeonWorktable', 'dungeonArmory',
  ]) {
    assert.ok(dungeon.viewpoints[id]?.position?.isVector3, `${id} publishes a stable viewpoint`);
  }

  cabin.basement.dispose();
  cabin.dispose();
});

test('dead captives wrap directly and tangible table tools swap without duplicating geometry', async () => {
  const registered = new Map();
  const wrapReady = new Set();
  const captiveEvents = [];
  const cabin = await buildCountrysideCabin({
    scene: new THREE.Scene(),
    externalLighting: true,
    interaction: {
      register(target, descriptor) { registered.set(target, descriptor); },
      unregister(target) { registered.delete(target); },
    },
    canCleanupWrap: (id) => wrapReady.has(id),
    onDungeonCaptive: (...args) => captiveEvents.push(args),
  });
  const { dungeon } = cabin.basement;
  const captive = dungeon.actors.counterStrike;
  const descriptor = registered.get(captive.bodyTarget);

  dungeon.sync({ captives: { counterStrike: { dead: true, cause: 'test-shot' } } });
  assert.equal(descriptor.enabled(), false,
    'campaign truth must authorize wrapping before the dead-body prompt appears');
  wrapReady.add(captive.cleanupBodyId);
  assert.equal(descriptor.enabled(), true);
  assert.match(descriptor.label(), /^Wrap the /);
  assert.doesNotMatch(descriptor.label(), /Inspect|Question/);
  descriptor.onUse();
  assert.deepEqual(captiveEvents.at(-1).slice(0, 2), [captive.id, 'wrap'],
    'using the corpse goes straight to the canonical wrapping mutation');

  assert.equal(dungeon.setHeldTool('pliers'), 'pliers');
  assert.equal(dungeon.heldToolId, 'pliers');
  assert.equal(dungeon.tools.pliers.visible, false, 'held pliers leave the physical table');
  assert.equal(dungeon.tools.saw.visible, true);
  assert.equal(dungeon.setHeldTool('saw'), 'saw');
  assert.equal(dungeon.tools.pliers.visible, true, 'swapping restores the previous tool');
  assert.equal(dungeon.tools.saw.visible, false);
  assert.equal(dungeon.setHeldTool(null), null);
  assert.equal(dungeon.tools.pliers.visible, true);
  assert.equal(dungeon.tools.saw.visible, true);

  cabin.dispose();
});

test('the dungeon worktable viewpoint resolves the aggregate worktable interaction', async () => {
  const camera = new THREE.PerspectiveCamera(68, 1, 0.045, 100);
  const interaction = new InteractionSystem(camera, {
    showPrompt() {}, hidePrompt() {}, setHold() {},
  });
  const cabin = await buildCountrysideCabin({
    scene: new THREE.Scene(),
    camera,
    externalLighting: true,
    interaction,
  });
  interaction.setOccluders(cabin.occluders ?? []);

  const viewpoint = cabin.interactionViewpoints.dungeonWorktable;
  camera.position.copy(viewpoint.position);
  camera.lookAt(viewpoint.lookAt);
  camera.updateMatrixWorld(true);
  interaction.update(0);

  assert.equal(
    interaction.current?.name,
    cabin.basement.dungeon.targets.tools.worktable.name,
  );

  cabin.dispose();
});
