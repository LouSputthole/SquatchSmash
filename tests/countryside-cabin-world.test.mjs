import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';
import {
  LANDMARKS,
  OVERLOOK_TRAIL,
  TRAIL_LOOP,
  insideProperty,
  samplePolyline,
} from '../src/cabin/field.js';

ensureDomShim();
ensureThreeShim();

const [
  { CABIN_ART_SLOTS, buildCountrysideCabin },
  { BATH_SLOTS, WALL_SLOTS },
  { buildGeometrySceneState },
  { Player },
  THREE,
] = await Promise.all([
  import('../src/cabin/world.js'),
  import('../src/world/apartment.js'),
  import('../tools/geometry-scenes.mjs'),
  import('../src/core/player.js'),
  import('three'),
]);

const worldSource = readFileSync(new URL('../src/cabin/world.js', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../src/cabin/main.js', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('../cabin.html', import.meta.url), 'utf8');

test('the cabin rehangs every exported apartment wall and bathroom art slot', () => {
  const apartmentSlots = [...WALL_SLOTS, ...BATH_SLOTS].map(({ slot }) => slot);
  assert.deepEqual(CABIN_ART_SLOTS, apartmentSlots);

  const privateApartmentArt = [
    'banner.main', 'banner.twitch', 'crest.round',
    'shelf.photo', 'sideboard.photo', 'desk.photo', 'night.photo',
    'closet.back', 'closet.shirt.a', 'closet.shirt.b',
    'shrine.b', 'bed.under',
    'fridge.magnet', 'fridge.photo.a', 'fridge.photo.b',
    'sticker.tower', 'sticker.fridge', 'sticker.fridge.b',
    'zyn.lid', 'label.beer', 'label.whiskey', 'eggs.carton', 'cereal.box',
  ];
  for (const slot of privateApartmentArt) {
    assert.match(worldSource, new RegExp(`['\"]${slot.replaceAll('.', '\\.') }['\"]`), slot);
  }
});

test('the cabin page wires the apartment-grade domestic systems as a separate hub', () => {
  const requiredSystems = [
    'createArcade',
    'new Phone',
    'new Tv',
    'new Radio',
    'createCampaignRadioAdapter',
    'createCountrysideCabinStory',
    'createPauseMenu',
    'createCampaignSceneRecovery',
    'navigateCampaign',
  ];
  for (const system of requiredSystems) {
    assert.ok(mainSource.includes(`${system}(`), `${system} must remain wired into the cabin`);
  }

  const utilityTargets = [
    'frontDoor', 'bathDoor', 'bed', 'couch', 'desk', 'tv', 'radio', 'phone',
    'fridge', 'cigs', 'whiskey', 'pizza', 'eggs', 'pan', 'shower', 'wardrobe', 'toilet',
    'ceilingLight', 'lamp', 'corkboard', 'art',
  ];
  for (const target of utilityTargets) {
    assert.match(worldSource, new RegExp(`utilityTargets\\.${target}\\s*=`), target);
  }

  assert.match(pageSource, /<div id="hud"/);
  assert.match(pageSource, /id="start-btn"[^>]*data-scene-start/);
  assert.match(pageSource, /data-ready="CABIN"/);
  assert.match(pageSource, /<script type="module" src="src\/cabin\/main\.js"/);
  assert.match(mainSource, /window\.CABIN\s*=\s*window\.COUNTRYSIDE_CABIN/);
  assert.match(mainSource, /function updateHeldUse\(dt\)/);
  assert.match(pageSource, /<kbd>F<\/kbd> consume/);
});

test('the runtime cabin property keeps a dense explorable landscape and complete hub', async () => {
  const built = await buildGeometrySceneState('cabin:property');

  assert.equal(built.id, 'cabin:property');
  assert.equal(built.roots.length, 1);
  assert.equal(built.roots[0].label, 'countryside-cabin-property');
  assert.ok(built.colliders.length >= 100, 'the cabin and property need substantial collision coverage');

  assert.equal(built.metadata.landmarkCount, 4);
  assert.ok(built.metadata.utilityCount >= 18, 'apartment-grade domestic utilities must remain available');
  assert.ok(built.metadata.artCount >= 47, 'wall art and private apartment pieces must stay placed');

  const landscape = built.metadata.landscape;
  assert.ok(landscape.trees >= 500, 'the surrounding woods must remain dense');
  assert.deepEqual(Object.keys(landscape.treeSpecies).sort(), ['birch', 'fir', 'hemlock', 'pine', 'snag']);
  assert.equal(Object.values(landscape.treeSpecies).reduce((sum, count) => sum + count, 0), landscape.trees);
  assert.ok(Object.values(landscape.treeSpecies).every((count) => count >= 30),
    'each authored tree silhouette needs a meaningful stand, not one token specimen');
  assert.ok(landscape.forestChunks >= 40, 'the explorable terrain needs authored forest coverage');
  assert.ok(landscape.undergrowth >= 1500, 'the forest floor must remain dressed');
  assert.ok(landscape.rocks >= 100, 'the property needs terrain detail beyond trees');
  assert.ok(landscape.deadfall >= 25, 'the woods need fallen timber and deadfall');
  assert.ok(landscape.trailBlazes >= 30, 'the full trail needs frequent visible blazes');
  assert.ok(landscape.duskBeacons >= 5, 'major approaches need dusk-visible beacons');
  assert.equal(landscape.firepitSeats, 3, 'the fire ring label needs real seating');
  assert.equal(landscape.overlookSeats, 1, 'the ridge needs an anchored focal seat');
  assert.equal(landscape.overlookVistaFeatures, 2, 'the ridge needs a rail and survey marker');
  assert.ok(landscape.exteriorFootings >= 40, 'new exterior dressing needs audited footings');
  assert.ok(landscape.trailMetres >= 350, 'the player needs a substantial trail loop');
  assert.ok(landscape.creekMetres >= 225, 'the creek must cross a meaningful part of the property');
});

test('the range interaction viewpoint keeps the Player capsule clear of the firing bench', async () => {
  const cabin = await buildCountrysideCabin({
    scene: new THREE.Scene(),
    externalLighting: true,
    interaction: { register() {} },
  });
  const view = cabin.interactionViewpoints.range;
  const floorY = cabin.groundAt(view.position.x, view.position.z);
  const capsule = new THREE.Box3(
    new THREE.Vector3(view.position.x - 0.30, floorY, view.position.z - 0.30),
    new THREE.Vector3(view.position.x + 0.30, floorY + 1.80, view.position.z + 0.30),
  );
  const blockers = cabin.colliders.filter((volume) => volume.intersectsBox(capsule));

  assert.deepEqual(blockers, [],
    `range interaction stance overlaps ${blockers.map(({ name }) => name || 'unnamed').join(', ')}`);

  cabin.dispose();
});

test('cabin callbacks own hub toggles and only authored landmarks reach story progress', async () => {
  const registered = new Map();
  const storyVisits = [];
  const calls = {
    frontDoor: 0, fridge: 0, porch: 0, woodpile: 0, car: 0, creekListen: 0,
  };
  let cabin;

  cabin = await buildCountrysideCabin({
    scene: new THREE.Scene(),
    externalLighting: true,
    interaction: {
      // Deliberately do not write target.userData.interact. The cabin builder
      // must retain landmark descriptors even with a read-only collaborator.
      register(target, descriptor) { registered.set(target, descriptor); },
    },
    time: { minutes: 12 * 60 },
    onFrontDoor: () => {
      calls.frontDoor++;
      cabin.toggleDoor();
    },
    onFridge: (open) => {
      calls.fridge++;
      cabin.setFridge(open);
    },
    onLandmark: (id) => storyVisits.push(id),
    onCreekListen: () => { calls.creekListen++; },
    onPorch: () => { calls.porch++; },
    onWoodpile: () => { calls.woodpile++; },
    onCar: () => { calls.car++; },
  });

  registered.get(cabin.utilityTargets.frontDoor).onUse();
  assert.equal(calls.frontDoor, 1);
  assert.equal(cabin.door.open, true, 'front-door callback must not be double-toggled');

  registered.get(cabin.utilityTargets.fridge).onUse();
  assert.equal(calls.fridge, 1);
  assert.equal(cabin.state.fridgeOpen, true, 'fridge callback must own the resulting state');

  cabin.setCeiling(true, { automatic: true });
  assert.equal(cabin.state.lightsOn, true);
  registered.get(cabin.utilityTargets.ceilingLight).onUse();
  assert.equal(cabin.state.lightsOn, false);
  cabin.setCeiling(true, { automatic: true });
  assert.equal(cabin.state.lightsOn, false, 'an automatic dusk refresh must preserve a manual switch choice');

  for (const item of ['cigs', 'whiskey', 'pizza']) {
    registered.get(cabin.utilityTargets[item]).onUse();
  }
  assert.equal(cabin.inventory.has('cigs'), true);
  assert.equal(cabin.inventory.has('whiskey'), true);
  assert.equal(cabin.inventory.has('slice'), true);

  assert.equal(cabin.setFireLit(false), false);
  assert.equal(cabin.setFireLit(true), true);

  for (const id of ['trailhead', 'bridge', 'porch', 'woodpile', 'car']) {
    assert.equal(cabin.interactionTargets[id].userData.interact, registered.get(cabin.interactionTargets[id]));
    registered.get(cabin.interactionTargets[id]).onUse();
  }
  assert.deepEqual(storyVisits, [], 'flavor and dedicated targets are not story landmarks');
  assert.deepEqual(calls, {
    frontDoor: 1, fridge: 1, porch: 1, woodpile: 1, car: 1, creekListen: 0,
  });

  for (const id of ['creek', 'overlook', 'shed', 'range']) {
    registered.get(cabin.interactionTargets[id]).onUse();
  }
  assert.deepEqual(storyVisits, ['creek', 'overlook', 'shed', 'range']);
  assert.equal(registered.get(cabin.interactionTargets.creek).hold, 0.55,
    'listening at the creek is a deliberate held interaction');
  assert.equal(calls.creekListen, 1, 'the held creek landmark starts its optional focus mode');
  assert.match(registered.get(cabin.interactionTargets.range).label(), /practice range/i,
    'the optional range advertises practice, not a campaign objective');
  assert.deepEqual(cabin.rifleRack.racks.map(({ id }) => id), ['carbine', 'shotgun'],
    'two distinct upstairs long guns support optional range practice');
  assert.deepEqual(cabin.basement.dungeon.armory.racks.map(({ id }) => id).sort(), ['ak47', 'barrett'],
    'the upstairs practice rifle must not move either basement gun');

  for (const spawn of Object.values(cabin.spawns)) {
    assert.equal(spawn.position.isVector3, true);
    assert.ok(Number.isFinite(spawn.yaw));
    assert.ok(Number.isFinite(spawn.pitch));
  }

  for (const [id, viewpoint] of Object.entries(cabin.viewpoints)) {
    assert.equal(viewpoint.position.isVector3, true, id);
    assert.ok(Number.isFinite(viewpoint.yaw) && Number.isFinite(viewpoint.pitch), `${id} facing`);
    assert.ok(Math.abs(viewpoint.position.y - (cabin.groundAt(viewpoint.position.x, viewpoint.position.z) + 1.68)) < 1e-9, `${id} footing`);
    assert.ok(Math.hypot(
      viewpoint.position.x - LANDMARKS[id].x,
      viewpoint.position.z - LANDMARKS[id].z,
    ) < 7, `${id} approach reach`);
    const interactionViewpoint = cabin.interactionViewpoints[id];
    assert.equal(interactionViewpoint.position.isVector3, true, `${id} interaction position`);
    assert.ok(Number.isFinite(interactionViewpoint.yaw) && Number.isFinite(interactionViewpoint.pitch), `${id} interaction facing`);
    const target = cabin.interactionTargets[id];
    target.geometry.computeBoundingBox();
    target.updateWorldMatrix(true, false);
    const bounds = target.geometry.boundingBox.clone().applyMatrix4(target.matrixWorld);
    const closest = bounds.clampPoint(interactionViewpoint.position, new THREE.Vector3());
    assert.ok(interactionViewpoint.position.distanceTo(closest) <= 2.7, `${id} live interaction reach`);
    const ray = new THREE.Raycaster(
      interactionViewpoint.position,
      interactionViewpoint.lookAt.clone().sub(interactionViewpoint.position).normalize(),
      0,
      2.7,
    );
    assert.ok(ray.intersectObject(target, true).length > 0, `${id} interaction ray`);
  }

  for (const footing of cabin.landscape.footings) {
    assert.equal(insideProperty(footing.x, footing.z), true, footing.id);
    assert.ok(Math.abs(footing.bottom - footing.ground) < 1e-6, `${footing.id} support`);
  }

  for (const [route, path] of [['loop', TRAIL_LOOP], ['overlook', OVERLOOK_TRAIL]]) {
    for (const point of samplePolyline(path, 0.75)) {
      const ground = cabin.groundAt(point.x, point.z);
      const blocker = cabin.colliders.find((bounds) => (
        point.x >= bounds.min.x - 0.34
        && point.x <= bounds.max.x + 0.34
        && point.z >= bounds.min.z - 0.34
        && point.z <= bounds.max.z + 0.34
        && bounds.max.y > ground + 0.16
        && bounds.min.y < ground + 1.62
      ));
      assert.equal(blocker, undefined, `${route} blocked by ${blocker?.name ?? 'unknown'} at ${point.x},${point.z}`);
    }
  }

  const bridgeWalker = new Player(new THREE.PerspectiveCamera(), {
    colliders: cabin.colliders,
    floorZones: cabin.floorZones,
    groundAt: (x, z) => cabin.groundAt(x, z),
  });
  bridgeWalker.mode = 'walk';
  bridgeWalker.enabled = true;
  bridgeWalker.ground = cabin.groundAt(LANDMARKS.bridge.x, LANDMARKS.bridge.z - 9);
  bridgeWalker.position.set(
    LANDMARKS.bridge.x,
    bridgeWalker.ground + bridgeWalker.eyeHeight,
    LANDMARKS.bridge.z - 9,
  );
  bridgeWalker.yaw = Math.PI;
  bridgeWalker.keys.add('KeyW');
  for (let frame = 0; frame < 600; frame++) bridgeWalker.update(1 / 60);
  assert.ok(bridgeWalker.position.z > LANDMARKS.bridge.z + 6,
    `the bridge collision stopped the player at z=${bridgeWalker.position.z.toFixed(2)}`);

  cabin.update(1, 1, new THREE.Vector3(0, 0, 0));
  const chunks = [];
  const undergrowth = [];
  const trunkMeshes = [];
  const nearTreeCrowns = [];
  const farTreeCrowns = [];
  const authoredPolish = new Set();
  cabin.root.traverse((object) => {
    if (object.name.startsWith('cabin-forest-chunk-')) chunks.push(object);
    if (object.name === 'cabin-fern-undergrowth') undergrowth.push(object);
    if (object.name === 'cabin-tree-trunks') trunkMeshes.push(object);
    if (object.name === 'cabin-tree-crowns-near') nearTreeCrowns.push(object);
    if (object.name === 'cabin-tree-crowns-far') farTreeCrowns.push(object);
    if (['cabin-central-table-cluster', 'cabin-ridge-overlook'].includes(object.name)) authoredPolish.add(object.name);
  });
  assert.ok(chunks.length >= 40);
  for (const chunk of chunks) {
    const near = chunk.children.find((child) => child.name === 'forest-near-lod');
    const far = chunk.children.find((child) => child.name === 'forest-far-lod');
    assert.equal(Boolean(near?.visible && far?.visible), false, `${chunk.name} LODs must be exclusive`);
  }
  assert.ok(undergrowth.length > 0);
  assert.ok(undergrowth.every((mesh) => mesh.geometry.type !== 'PlaneGeometry'), 'undergrowth uses shaped low-poly fronds');
  assert.ok(trunkMeshes.length > 0);
  assert.equal(nearTreeCrowns.length, trunkMeshes.length);
  assert.equal(farTreeCrowns.length, trunkMeshes.length);
  assert.ok(trunkMeshes.every((mesh) => mesh.parent?.name.startsWith('cabin-forest-chunk-')),
    'trunks stay mounted to the chunk so distant crowns never float');
  assert.ok([...trunkMeshes, ...nearTreeCrowns, ...farTreeCrowns].every((mesh) => mesh.instanceColor),
    'the five-species forest keeps its per-instance species tint');
  assert.deepEqual([...authoredPolish].sort(), ['cabin-central-table-cluster', 'cabin-ridge-overlook']);
  assert.ok(cabin.root.getObjectByName('cabin-overlook-view-rail'));
  assert.ok(cabin.root.getObjectByName('cabin-overlook-survey-marker'));

  const nightPhoto = cabin.frames.find(({ slot }) => slot === 'night.photo')?.mesh;
  const alarm = cabin.root.getObjectByName('alarmclock');
  const phoneTarget = cabin.utilityTargets.phone;
  assert.ok(nightPhoto && alarm && phoneTarget, 'nightstand photo, alarm, and phone must all be built');
  const nightPhotoBounds = new THREE.Box3().setFromObject(nightPhoto);
  assert.equal(nightPhotoBounds.intersectsBox(new THREE.Box3().setFromObject(alarm)), false,
    'the nightstand photograph must not intrude into the alarm clock');
  assert.equal(nightPhotoBounds.intersectsBox(new THREE.Box3().setFromObject(phoneTarget)), false,
    'the nightstand photograph must leave the phone interaction clear');

  for (const liner of [
    'cabin-bathroom-liner-south-west',
    'cabin-bathroom-liner-south-east',
    'cabin-bathroom-liner-south-header',
  ]) assert.ok(cabin.root.getObjectByName(liner), `${liner} must hide the shared timber wall`);
  const bathArt = cabin.frames.find(({ slot }) => slot === 'bath.mirror')?.mesh;
  assert.ok(bathArt && cabin.mirrorMesh);
  assert.equal(
    new THREE.Box3().setFromObject(bathArt)
      .intersectsBox(new THREE.Box3().setFromObject(cabin.mirrorMesh)),
    false,
    'bathroom wall art must not intrude into the functional sink mirror',
  );

  const terrain = cabin.root.getObjectByName('cabin-property-heightfield');
  assert.ok(terrain.userData.cabinTerrain.relief > 6, 'the property needs a real creek-to-ridge relief profile');
  assert.ok(terrain.userData.cabinTerrain.surfaceCount >= 7, 'terrain colour keeps authored surfaces legible');

  const forbiddenExternalLights = [];
  cabin.root.traverse((object) => {
    if (object.isHemisphereLight || object.isDirectionalLight || object.isAmbientLight) {
      forbiddenExternalLights.push(object);
    }
  });
  assert.deepEqual(forbiddenExternalLights, [], 'externalLighting leaves the day/night rig to main');

  await cabin.models;
  cabin.dispose();
});
