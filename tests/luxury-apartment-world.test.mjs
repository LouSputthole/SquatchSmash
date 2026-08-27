import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';
import { readSpatialPrimitive } from '../src/core/spatial-contract.js';

ensureDomShim();
ensureThreeShim();

const [worldModule, apartmentModule, runtimeModule, playerModule, THREE] = await Promise.all([
  import('../src/luxury-apartment/world.js'),
  import('../src/world/apartment.js'),
  import('../src/luxury-apartment/runtime.js'),
  import('../src/core/player.js'),
  import('three'),
]);

const {
  LUXURY_APARTMENT,
  LUXURY_ART_SLOTS,
  LUXURY_DISPLAY_ART_SLOTS,
  LUXURY_EXTRA_ART_SLOTS,
  LUXURY_HUNG_ART_SLOTS,
  LUXURY_PROP_ART_SLOTS,
  LUXURY_STANDING_ART_SLOTS,
  buildLuxuryApartment,
} = worldModule;
const { WALL_SLOTS, BATH_SLOTS } = apartmentModule;
const { validateLuxuryWorld } = runtimeModule;
const { Player } = playerModule;

const cssSource = readFileSync(new URL('../src/luxury-apartment/luxury-apartment.css', import.meta.url), 'utf8');

async function build(overrides = {}) {
  const registered = new Map();
  const world = await buildLuxuryApartment({
    scene: new THREE.Scene(),
    interaction: {
      register(target, descriptor) {
        registered.set(target, descriptor);
        target.userData.interact = descriptor;
      },
    },
    ...overrides,
  });
  return { world, registered };
}

function horizontalClearance(point, box3) {
  const dx = Math.max(box3.min.x - point.x, 0, point.x - box3.max.x);
  const dz = Math.max(box3.min.z - point.z, 0, point.z - box3.max.z);
  return Math.hypot(dx, dz);
}

function colliderNamed(world, name) {
  return world.colliders.find((entry) => entry.name === name);
}

function penetrationDepth(first, second) {
  const depths = [
    Math.min(first.max.x, second.max.x) - Math.max(first.min.x, second.min.x),
    Math.min(first.max.y, second.max.y) - Math.max(first.min.y, second.min.y),
    Math.min(first.max.z, second.max.z) - Math.max(first.min.z, second.min.z),
  ];
  return depths.every((depth) => depth > 0) ? Math.min(...depths) : 0;
}

test('luxury world gives every imported and new art asset a real semantic placement', async () => {
  const exportedApartmentWallSlots = [...WALL_SLOTS, ...BATH_SLOTS].map(({ slot }) => slot);
  for (const slot of exportedApartmentWallSlots) assert.ok(LUXURY_ART_SLOTS.includes(slot), slot);
  for (const slot of [
    'banner.main', 'banner.twitch', 'crest.round',
    'shelf.photo', 'sideboard.photo', 'desk.photo', 'night.photo',
    'closet.back', 'closet.shirt.a', 'closet.shirt.b', 'shrine.b', 'bed.under',
    'fridge.magnet', 'fridge.photo.a', 'fridge.photo.b',
    'sticker.tower', 'sticker.fridge', 'sticker.fridge.b',
    'zyn.lid', 'label.beer', 'label.whiskey', 'eggs.carton', 'cereal.box',
  ]) {
    assert.ok(LUXURY_ART_SLOTS.includes(slot), slot);
  }
  assert.ok(LUXURY_EXTRA_ART_SLOTS.includes('luxury.night-watch'));
  assert.ok(LUXURY_EXTRA_ART_SLOTS.includes('luxury.ascension'));
  assert.equal(LUXURY_ART_SLOTS.length, 74);
  assert.equal(LUXURY_DISPLAY_ART_SLOTS.length, 60);
  assert.equal(LUXURY_HUNG_ART_SLOTS.length, 54);
  assert.equal(LUXURY_STANDING_ART_SLOTS.length, 6);
  assert.equal(LUXURY_PROP_ART_SLOTS.length, 14);
  assert.deepEqual(
    LUXURY_DISPLAY_ART_SLOTS.filter((slot) => LUXURY_PROP_ART_SLOTS.includes(slot)),
    [],
  );

  const { world } = await build();
  const displayed = Object.keys(world.artTargets);
  const propPlaced = Object.keys(world.propArtPlacements);
  assert.equal(displayed.length, LUXURY_DISPLAY_ART_SLOTS.length);
  assert.equal(propPlaced.length, LUXURY_PROP_ART_SLOTS.length);
  assert.deepEqual([...new Set([...displayed, ...propPlaced])].sort(), [...LUXURY_ART_SLOTS].sort());
  assert.equal(world.resolvedArt.size, LUXURY_ART_SLOTS.length);
  assert.equal([...world.resolvedArt.values()].every(({ texture }) => texture?.isTexture), true);

  for (const slot of LUXURY_DISPLAY_ART_SLOTS) {
    const target = world.artTargets[slot];
    assert.ok(target?.isObject3D, `${slot} display`);
    assert.ok(target.userData.artZone, `${slot} semantic zone`);
    assert.notEqual(target.userData.artDisplayKind, 'prop', slot);
  }
  for (const slot of LUXURY_PROP_ART_SLOTS) {
    const target = world.propArtPlacements[slot];
    assert.ok(target?.isObject3D, `${slot} prop placement`);
    assert.ok(target.userData.artZone, `${slot} semantic zone`);
    assert.equal(target.userData.artDisplayKind, 'prop', slot);
    assert.equal(
      target.userData.artTextureAttached,
      world.resolvedArt.get(slot).real ? true : null,
      `${slot} resolved texture attachment`,
    );
  }
  for (const slot of LUXURY_EXTRA_ART_SLOTS) {
    assert.equal(world.artTargets[slot].userData.artSource, 'luxury', slot);
    assert.ok(world.artTargets[slot].userData.artZone, `${slot} authored zone`);
  }
  assert.equal(world.artTargets['luxury.night-watch'].userData.artAspect, 1.5);
  assert.equal(world.artTargets['luxury.ascension'].userData.artAspect, 2 / 3);
  assert.equal(world.artTargets['banner.main'].userData.artDisplayKind, 'banner');
  assert.equal(world.artTargets['crest.round'].userData.artDisplayKind, 'crest');
  assert.equal(world.artTargets['bed.under'].userData.artDisplayKind, 'under-bed');
  world.dispose();
});

test('luxury world builds a validated two-floor hub with screens, zones and parity targets', async () => {
  const { world } = await build();
  validateLuxuryWorld(world);

  assert.equal(world.metrics.floors, 2);
  assert.equal(world.metrics.stairSteps, 18);
  assert.ok(world.metrics.doubleHeightMetres >= 6.7);
  assert.ok(world.metrics.panoramicWindowArea >= 200);
  assert.equal(world.metrics.artTargets, LUXURY_DISPLAY_ART_SLOTS.length);
  assert.equal(world.metrics.visibleArtAssets, LUXURY_ART_SLOTS.length);
  assert.equal(
    world.metrics.resolvedRealArtAssets,
    [...world.resolvedArt.values()].filter(({ real }) => real).length,
  );
  assert.equal(world.metrics.propArtPlacements, LUXURY_PROP_ART_SLOTS.length);
  assert.equal(world.metrics.extraArtSlots, LUXURY_EXTRA_ART_SLOTS.length);
  assert.equal(world.metrics.minigameCount, 5);
  assert.ok(world.colliders.length >= 35);
  assert.equal(world.colliders.filter(({ name }) => name === 'luxury-stair-rail-west-collider').length, 1);
  assert.equal(world.colliders.filter(({ name }) => name === 'luxury-stair-rail-east-collider').length, 1);
  assert.equal(world.root.getObjectByName('luxury-stair-rail-west')?.isObject3D, true);
  assert.equal(world.root.getObjectByName('luxury-stair-rail-east')?.isObject3D, true);
  assert.ok(world.floorZones.length >= 20, 'each real stair tread and both floors remain described');

  for (const screen of ['pc', 'tv', 'arcade', 'console']) assert.ok(world.screens[screen]?.isObject3D, screen);
  for (const station of ['pc', 'arcade', 'poker', 'darts', 'console']) {
    assert.equal(world.gameStations[station].id, station);
    assert.ok(world.gameStations[station].anchor.isObject3D);
    assert.equal(world.gameStations[station].anchor.userData.station.id, station);
  }
  for (const target of [
    'frontDoor', 'elevator', 'bathroomDoor', 'bed', 'couch', 'desk', 'tv', 'radio', 'phone',
    'fridge', 'kitchen', 'cigarettes', 'shower', 'wardrobe', 'toilet', 'mainLights', 'loftLights',
    'cityGlass', 'shades', 'answeringMachine', 'revolver', 'ammo', 'bong', 'shrooms',
    'whiteLine', 'crookedArt', 'crookedFrame', 'art',
  ]) assert.ok(world.utilityTargets[target], target);

  assert.equal(world.groundAt(0, -4), LUXURY_APARTMENT.loftY);
  assert.equal(world.groundAt(0, 4), LUXURY_APARTMENT.mainY);
  assert.equal(world.toiletFloorY, LUXURY_APARTMENT.mainY);
  const bathroomX = (LUXURY_APARTMENT.bathroom.x0 + LUXURY_APARTMENT.bathroom.x1) / 2;
  const bathroomZ = (LUXURY_APARTMENT.bathroom.z0 + LUXURY_APARTMENT.bathroom.z1) / 2;
  assert.equal(world.groundAt(bathroomX, bathroomZ, 1.66), LUXURY_APARTMENT.mainY);
  assert.equal(world.groundAt(bathroomX, bathroomZ, LUXURY_APARTMENT.loftY + 1.66), LUXURY_APARTMENT.loftY);
  assert.ok(world.toiletBowl.isVector3);
  assert.ok(world.toiletCollider?.isBox3);
  assert.ok(world.showerHead.isVector3 && world.showerStand.isVector3);
  assert.equal(world.artTargets['luxury.night-watch'].userData.artAspect, 1.5);
  assert.equal(world.artTargets['luxury.ascension'].userData.artAspect, 2 / 3);

  const footsteps = new Player(new THREE.PerspectiveCamera(), world);
  assert.equal(footsteps.surfaceAt(new THREE.Vector3(2, 0, 2)), 'rug');
  assert.equal(footsteps.surfaceAt(new THREE.Vector3(8, 0, 2)), 'tile');
  assert.equal(footsteps.surfaceAt(new THREE.Vector3(bathroomX, LUXURY_APARTMENT.mainY, bathroomZ)), 'tile');

  world.dispose();
});

test('every Luxury collider declares stable authored spatial meaning', async () => {
  const { world } = await build();
  const records = world.colliders.map((collider) => readSpatialPrimitive(collider));
  assert.equal(records.length, 66, 'the complete live Luxury collision inventory changed');
  assert.ok(records.every(Boolean), 'an addBounds call bypassed the spatial contract');
  assert.equal(new Set(records.map(({ id }) => id)).size, records.length,
    'Luxury collider spatial ids are not unique');
  assert.deepEqual(
    Object.fromEntries([...records.reduce((counts, { kind }) => (
      counts.set(kind, (counts.get(kind) ?? 0) + 1)
    ), new Map())].sort(([left], [right]) => left.localeCompare(right))),
    { door: 3, prop: 22, seat: 9, world: 32 },
  );
  world.dispose();
});

test('the poker room is deliberately solo and keeps all four future seats', async () => {
  const { world } = await build();
  world.root.updateMatrixWorld(true);
  assert.equal(world.poker.patrons.length, 0);
  assert.equal(world.metrics.pokerPatrons, 0);
  assert.equal(world.poker.seats.length, 4);
  assert.equal(world.root.getObjectByName('luxury-poker-patron-east'), undefined);
  for (const seat of world.poker.seats) {
    const spatial = readSpatialPrimitive(colliderNamed(world, `${seat.name}-collider`));
    assert.equal(spatial.kind, 'seat');
    assert.equal(spatial.intentionalOverlapWith, undefined);
  }
  world.dispose();
});

test('every authored pose exits with at least 0.30m of collision clearance', async () => {
  const { world } = await build();
  for (const [id, authoredPose] of Object.entries(world.poses)) {
    const bodyMinY = authoredPose.exit.y + 0.05;
    const bodyMaxY = authoredPose.exit.y + 1.68;
    const relevant = world.colliders.filter(
      (entry) => entry.max.y > bodyMinY && entry.min.y < bodyMaxY,
    );
    const clearance = Math.min(...relevant.map((entry) => horizontalClearance(authoredPose.exit, entry)));
    assert.ok(clearance >= 0.30 - 1e-6, `${id} exit clearance ${clearance.toFixed(3)}m`);
  }
  world.dispose();
});

test('the main-floor bathroom is physically traversable through its live door collider', async () => {
  const { world } = await build();
  const bath = LUXURY_APARTMENT.bathroom;
  const doorwayX = (bath.doorX0 + bath.doorX1) / 2;
  const camera = new THREE.PerspectiveCamera();
  const player = new Player(camera, world);
  player.position.set(doorwayX, 1.68, -0.30);
  player.yaw = 0;
  player.mode = 'walk';
  player.enabled = true;

  assert.equal(world.doors.bathroom.isOpen(), true, 'the transparent entrance starts visibly open');
  for (let index = 0; index < 180; index++) world.update(1 / 120);
  assert.ok(Math.abs(world.doors.bathroom.pivot.rotation.y) > 1.4, 'door reaches its open pose');

  player.setKey('KeyW', true);
  for (let index = 0; index < 240 && player.position.z > -1.40; index++) player.update(1 / 120);
  player.setKey('KeyW', false);
  assert.ok(player.position.z <= -1.40, `player entered the bathroom at z=${player.position.z.toFixed(3)}`);
  assert.ok(player.position.x >= bath.x0 + 0.30 && player.position.x <= bath.x1 - 0.30,
    `player capsule remains inside the finished side walls at x=${player.position.x.toFixed(3)}`);

  player.setKey('KeyS', true);
  for (let index = 0; index < 240 && player.position.z < -0.40; index++) player.update(1 / 120);
  player.setKey('KeyS', false);
  assert.ok(player.position.z >= -0.40, `player exited back to the main floor at z=${player.position.z.toFixed(3)}`);
  world.dispose();
});

test('luxury authored polish includes a deep two-facade skyline, lighting and usable seating', async () => {
  const { world } = await build();
  assert.ok(world.metrics.cityBuildings >= 14);
  assert.ok(world.metrics.cityDepthBands >= 3);
  assert.ok(world.metrics.cityMinimumSetback >= 12);
  assert.ok(world.metrics.cityWindowsSouth >= 100);
  assert.ok(world.metrics.cityWindowsEast >= 100);
  assert.ok(world.metrics.cityRoofFeatures >= world.metrics.cityBuildings);
  assert.equal(world.metrics.cityLowestBuildingY, world.metrics.cityGroundY);
  assert.equal(world.cityGround.name, 'luxury-city-grounding-plane');

  const southSky = world.root.getObjectByName('luxury-city-panorama-south');
  const eastSky = world.root.getObjectByName('luxury-city-panorama-east');
  assert.ok(southSky && eastSky);
  assert.equal(southSky.material, eastSky.material, 'both panoramas share the live time grade');
  const cornerOverlap = Math.min(
    southSky.geometry.parameters.width / 2 - eastSky.position.x,
    eastSky.geometry.parameters.width / 2 - southSky.position.z,
  );
  assert.ok(cornerOverlap >= 5, `southeast backdrop overlap ${cornerOverlap.toFixed(2)}m`);
  world.setCityTime(20 * 60 + 30);
  const night = southSky.material.color.getHex();
  const nightOpacity = southSky.material.opacity;
  world.setCityTime(8 * 60);
  const morning = southSky.material.color.getHex();
  const morningOpacity = southSky.material.opacity;
  const morningMap = southSky.material.map;
  assert.equal(southSky.material.userData.citySkyPhase, 'day');
  assert.equal(morning, night, 'phase-specific textures carry the sky palette');
  assert.ok(morningOpacity > nightOpacity);
  assert.equal(eastSky.material.color.getHex(), morning);
  assert.equal(eastSky.material.opacity, morningOpacity);
  world.setCityTime(20 * 60 + 30);
  assert.equal(southSky.material.userData.citySkyPhase, 'night');
  assert.notEqual(southSky.material.map, morningMap);

  assert.ok(world.lights.chandelierLight.isPointLight);
  assert.ok(world.lights.chandelierLight.intensity >= 100);
  assert.ok(world.artLights.every(({ light }) => light.intensity >= 35 && light.intensity <= 45));
  assert.ok(world.artLights.every(({ light }) => light.angle <= Math.PI / 8));

  const primaryCouch = colliderNamed(world, 'luxury-lounge-sectional-collider');
  const returnCouch = colliderNamed(world, 'luxury-lounge-return-collider');
  const returnGroup = world.root.getObjectByName('luxury-lounge-return');
  assert.ok(primaryCouch && returnCouch && returnGroup);
  assert.ok(Math.abs(returnGroup.rotation.y - Math.PI / 2) < 1e-9);
  assert.ok(Math.abs((returnCouch.max.x - returnCouch.min.x - 0.04) - 2.18) < 1e-9);
  assert.ok(Math.abs((returnCouch.max.z - returnCouch.min.z - 0.04) - 0.94) < 1e-9);
  assert.ok((returnCouch.min.z + returnCouch.max.z) / 2 >= 5.29,
    'the perpendicular return sits on the outer edge of the rug near the glass');
  assert.equal(primaryCouch.intersectsBox(returnCouch), true, 'sectional pieces join at the corner');

  assert.equal(world.gameStations.arcade.seat.name, 'luxury-arcade-stool');
  assert.ok(colliderNamed(world, 'luxury-arcade-stool-collider'));
  const arcadeCamera = new THREE.PerspectiveCamera(68, 1280 / 800, 0.045, 320);
  const arcadePlayer = new Player(arcadeCamera, world);
  arcadePlayer.position.set(0, 1.68, 1);
  arcadePlayer.mode = 'walk';
  arcadePlayer.sitAt(world.poses.arcade);
  for (let i = 0; i < 120; i++) arcadePlayer.update(1 / 60);
  world.root.updateMatrixWorld(true);
  arcadeCamera.updateProjectionMatrix();
  arcadeCamera.updateMatrixWorld(true);
  const arcadeScreen = world.screens.arcade;
  const projectedArcade = [
    [0, 0],
    [-0.375, -0.23],
    [0.375, -0.23],
    [-0.375, 0.23],
    [0.375, 0.23],
  ].map(([x, y]) => arcadeScreen.localToWorld(new THREE.Vector3(x, y, 0)).project(arcadeCamera));
  assert.ok(Math.abs(projectedArcade[0].x) < 0.03 && Math.abs(projectedArcade[0].y) < 0.03,
    'arcade screen is centered in the seated camera');
  assert.ok(projectedArcade.slice(1).every(({ x, y }) => Math.abs(x) < 0.60 && Math.abs(y) < 0.60),
    'the complete cabinet screen remains visible');
  assert.ok(Math.max(...projectedArcade.slice(1).map(({ x }) => Math.abs(x))) > 0.48,
    'the cabinet screen fills the seated view instead of appearing distant');
  /* Four chairs and nobody in them: tests/luxury-apartment-poker-table.test.mjs
   * owns the emptiness. This case still owns the furniture. */
  assert.equal(world.gameStations.poker.seats.length, 4);
  assert.equal(world.poker.patrons.length, 0, 'the solo beat has no random poker partners');
  for (const seat of world.gameStations.poker.seats) {
    assert.ok(colliderNamed(world, `${seat.name}-collider`), seat.name);
  }
  const feltTop = world.poker.felt.userData.topY;
  const railRadius = world.poker.rail.geometry.parameters.tube;
  assert.ok(world.poker.rail.position.y - railRadius < feltTop);
  assert.ok(world.poker.rail.position.y > feltTop, 'poker trim nests into the felt without floating');
  assert.equal(world.poker.rail.scale.z, world.poker.felt.scale.z,
    'outer dark-wood rail follows the same oval as the felt');

  assert.equal(world.deskChair.group.userData.workstationMaterial, 'dark');
  assert.equal(world.deskZyn.group.userData.desktopHalf, 'front');
  const desktopBounds = new THREE.Box3().setFromObject(world.desk.group.children[0]);
  const zynBounds = new THREE.Box3().setFromObject(world.deskZyn.group);
  assert.ok(zynBounds.min.x >= desktopBounds.min.x && zynBounds.max.x <= desktopBounds.max.x);
  assert.ok(zynBounds.min.z >= desktopBounds.min.z && zynBounds.max.z <= desktopBounds.max.z,
    'Zyn is wholly supported by the desktop');
  assert.ok(Math.abs(zynBounds.min.y - desktopBounds.max.y) < 0.04, 'Zyn is not floating above the desk');

  assert.equal(world.bathroom.floorY, LUXURY_APARTMENT.mainY);
  assert.equal(world.bathroom.shell.name, 'luxury-under-stair-bathroom');
  assert.ok(LUXURY_APARTMENT.bathroom.x1 - LUXURY_APARTMENT.bathroom.x0 >= 3.6,
    'bathroom expands into the former east service bay');
  assert.equal(world.doors.bathroom.leaf.material, world.materials.bathGlass);
  assert.ok(world.doors.bathroom.leaf.material.opacity <= 0.28 && world.doors.bathroom.isOpen());
  assert.ok(world.mirrorMesh.geometry instanceof THREE.PlaneGeometry, 'bathroom exposes the shared planar-mirror surface');
  const sinkBounds = new THREE.Box3().setFromObject(world.bathroom.sink.group);
  const toiletBounds = new THREE.Box3().setFromObject(world.bathroom.toilet.group);
  assert.ok(sinkBounds.min.x >= LUXURY_APARTMENT.bathroom.x0 - 1e-6
    && sinkBounds.max.x <= LUXURY_APARTMENT.bathroom.x1 + 1e-6,
  'wall-mounted sink and mirror do not bleed through the bathroom shell');
  assert.ok(toiletBounds.min.z - (LUXURY_APARTMENT.bathroom.z0 + 0.10) <= 0.02,
    'toilet tank is set against the finished north wall');
  assert.ok(toiletBounds.min.x >= LUXURY_APARTMENT.bathroom.x0
    && toiletBounds.max.x <= LUXURY_APARTMENT.bathroom.x1
    && toiletBounds.min.z >= LUXURY_APARTMENT.bathroom.z0
    && toiletBounds.max.z <= LUXURY_APARTMENT.bathroom.z1,
  'toilet remains wholly inside the room');
  const paperPlate = world.bathroom.toiletPaper.getObjectByName('luxury-toilet-paper-wall-plate');
  const paperRoll = world.bathroom.toiletPaper.getObjectByName('luxury-toilet-paper-roll');
  assert.ok(paperPlate && paperRoll);
  assert.ok(Math.abs(paperPlate.position.x - (LUXURY_APARTMENT.bathroom.x1 - 0.115)) < 0.01,
    'toilet paper plate is mounted against the east wall');
  assert.ok(paperRoll.position.z > LUXURY_APARTMENT.bathroom.z0
    && paperRoll.position.z < LUXURY_APARTMENT.bathroom.z1);
  for (const [fixture, wall] of [
    ['luxury-main-bath-sink-collider', 'luxury-bath-east-collider'],
    ['luxury-main-toilet-collider', 'luxury-bath-north-collider'],
    ['luxury-bathroom-door-collider', 'luxury-bath-south-west-collider'],
    ['luxury-bathroom-door-collider', 'luxury-bath-south-east-collider'],
    ['luxury-sealed-under-loft-west-back', 'luxury-bath-north-collider'],
    ['luxury-sealed-under-loft-west-back', 'luxury-bath-west-collider'],
  ]) {
    assert.ok(
      penetrationDepth(colliderNamed(world, fixture), colliderNamed(world, wall)) <= 1e-9,
      `${fixture}/${wall}`,
    );
  }
  assert.equal(world.doors.front.locked, true, 'the service door cannot bypass the elevator');
  assert.ok(world.root.getObjectByName('luxury-elevator-cab'), 'the canonical elevator has a physical cab');

  assert.ok(world.darts.backing.isObject3D && world.darts.rack.isObject3D);
  assert.equal(world.darts.sections.length, 20);
  assert.equal(world.darts.sections[0], 20);
  assert.equal(world.darts.face.name, 'luxury-darts-numbered-face');
  assert.ok(world.darts.face.material.map?.isTexture && world.darts.light.isSpotLight);
  assert.deepEqual(world.darts.normal.toArray(), [0, 0, 1]);
  assert.ok(Math.abs(world.darts.board.position.z - world.darts.backing.position.z) < 0.10,
    'dartboard is mounted flush to its backing');
  assert.equal(world.artTargets['banner.main'].userData.artZone, 'bedroom-privacy-wall');
  assert.equal(world.artTargets['banner.twitch'].userData.artZone, 'bedroom-privacy-wall');
  assert.ok(world.root.getObjectByName('luxury-bedroom-privacy-wall'), 'bedroom has a finished privacy wall');
  assert.ok(world.root.getObjectByName('luxury-fitted-wine-cooler'), 'kitchen/fridge gap is fitted');
  assert.ok(world.root.getObjectByName('luxury-top-stair-focal'), 'top landing has a focal object');
  assert.equal(world.root.getObjectByName('luxury-entertainment-console').rotation.y, Math.PI);
  assert.equal(world.artTargets['crest.round'].position.x, -5.55);
  assert.equal(world.artTargets['luxury.arcade.marquee'], undefined);
  assert.equal(world.artTargets['feature.stacks'].userData.artZone, 'loft-office-history-row');
  assert.equal(world.artTargets['cork.above'].userData.artZone, 'bedroom-headboard-photos');
  assert.equal(world.artTargets['bath.toilet.poster'].userData.artZone, 'bedroom-headboard-photos');
  assert.equal(
    colliderNamed(world, 'luxury-bedroom-wall-panel-1-collider')
      .intersectsBox(colliderNamed(world, 'luxury-walk-in-wardrobe-collider')),
    false,
    'bedroom partition terminates at the wardrobe shell',
  );
  const bedBounds = new THREE.Box3().setFromObject(world.root.getObjectByName('luxury-loft-bed'));
  assert.ok(bedBounds.min.z <= LUXURY_APARTMENT.loft.z0 && bedBounds.min.z >= LUXURY_APARTMENT.z0,
    'bed meets the north wall without bleeding outside the apartment');

  const dividerColliders = world.colliders.filter((entry) => /^luxury-office-slat-divider-slat-\d-collider$/.test(entry.name));
  assert.equal(dividerColliders.length, 7);
  const circulationPoint = new THREE.Vector3(2.18, LUXURY_APARTMENT.loftY, -3.12);
  assert.ok(
    Math.min(...dividerColliders.map((entry) => horizontalClearance(circulationPoint, entry))) >= 0.30,
    'office divider leaves the intended south-end circulation route open',
  );

  world.dispose();
});

test('luxury interactions preserve tap/hold parity and expose deterministic controls', async () => {
  const calls = [];
  let cigaretteCount = 6;
  const { world, registered } = await build({
    onFrontDoor: (action) => calls.push(['front', action]),
    onElevator: (action) => calls.push(['elevator', action]),
    onBathroomDoor: (open) => calls.push(['bathroom', open]),
    cigaretteStatus: () => ({ full: cigaretteCount >= 12, count: cigaretteCount }),
    onCigarettes: () => {
      const added = Math.min(6, 12 - cigaretteCount);
      cigaretteCount += added;
      calls.push(['cigarettes', added]);
      return { added, full: cigaretteCount >= 12 };
    },
    onToilet: (mode) => calls.push(['toilet', mode]),
    onMinigame: (id) => calls.push(['game', id]),
    onArt: (slot, record) => calls.push(['art', slot, typeof record]),
    onCrookedArt: (art) => {
      art.setCrookedness(0);
      calls.push(['crooked', art.slot]);
    },
  });

  world.setLights('all', true, { automatic: true });
  assert.equal(world.state.mainLightsOn, true);
  registered.get(world.utilityTargets.mainLights).onUse();
  assert.equal(world.state.mainLightsOn, false);
  world.setLights('main', true, { automatic: true });
  assert.equal(world.state.mainLightsOn, false, 'automatic lighting preserves a manual choice');

  const toilet = registered.get(world.utilityTargets.toilet);
  assert.equal(toilet.hold, 0.70);
  toilet.onTap();
  toilet.onUse();
  registered.get(world.utilityTargets['minigame.arcade']).onUse();
  registered.get(world.artTargets['luxury.night-watch']).onUse();
  registered.get(world.utilityTargets.crookedArt).onUse();
  assert.deepEqual(calls, [
    ['toilet', 'sit'],
    ['toilet', 'aim'],
    ['game', 'arcade'],
    ['art', 'luxury.night-watch', 'object'],
    ['crooked', 'cork.above'],
  ]);
  assert.ok(Math.abs(world.crookedArt.panel.rotation.z) < 1e-9);

  const frontDoor = registered.get(world.utilityTargets.frontDoor);
  assert.equal(frontDoor.onUse(), false);
  assert.equal(world.doors.front.open(), false);
  assert.equal(world.state.frontDoorOpen, false);

  const elevator = registered.get(world.utilityTargets.elevator);
  elevator.onUse();
  assert.equal(world.state.elevatorOpen, true);
  elevator.onUse();
  assert.equal(world.state.elevatorOpen, false);

  const bathroom = registered.get(world.utilityTargets.bathroomDoor);
  assert.equal(world.state.bathroomDoorOpen, true);
  bathroom.onUse();
  assert.equal(world.state.bathroomDoorOpen, false);
  bathroom.onUse();
  assert.equal(world.state.bathroomDoorOpen, true);

  const cigarettes = registered.get(world.utilityTargets.cigarettes);
  assert.match(cigarettes.label(), /Replenish/);
  assert.deepEqual(cigarettes.onUse(), { added: 6, full: true });
  assert.match(cigarettes.label(), /already have a full pack/);
  assert.deepEqual(cigarettes.onUse(), { added: 0, full: true });

  assert.equal(world.setShades(true), true);
  for (let i = 0; i < 30; i++) world.update(1 / 60, i / 60);
  assert.ok(world.state.shadesT > 0.8);
  assert.ok(world.shades.south.every((shade) => shade.scale.y > 0.8));

  assert.deepEqual(calls.slice(-7), [
    ['front', 'blocked'],
    ['elevator', 'call'],
    ['elevator', 'ride'],
    ['bathroom', true],
    ['bathroom', false],
    ['cigarettes', 6],
    ['cigarettes', 0],
  ]);

  world.dispose();
});

test('luxury styling owns the standalone hub surfaces', () => {
  for (const selector of [
    'body.luxury-apartment', '#luxury-grade', '#luxury-vignette', '#luxury-rest',
    '#luxury-game-panel', 'body.luxury-apartment #overlay', 'body.luxury-apartment #loading',
  ]) assert.ok(cssSource.includes(selector), selector);
});
