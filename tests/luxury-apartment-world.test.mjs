import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

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
  assert.equal(LUXURY_ART_SLOTS.length, 75);
  assert.equal(LUXURY_DISPLAY_ART_SLOTS.length, 61);
  assert.equal(LUXURY_HUNG_ART_SLOTS.length, 55);
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
  assert.ok(world.floorZones.length >= 20, 'each real stair tread and both floors remain described');

  for (const screen of ['pc', 'tv', 'arcade', 'console']) assert.ok(world.screens[screen]?.isObject3D, screen);
  for (const station of ['pc', 'arcade', 'poker', 'darts', 'console']) {
    assert.equal(world.gameStations[station].id, station);
    assert.ok(world.gameStations[station].anchor.isObject3D);
    assert.equal(world.gameStations[station].anchor.userData.station.id, station);
  }
  for (const target of [
    'frontDoor', 'elevator', 'bed', 'couch', 'desk', 'tv', 'radio', 'phone',
    'fridge', 'kitchen', 'shower', 'wardrobe', 'toilet', 'mainLights', 'loftLights',
    'cityGlass', 'shades', 'answeringMachine', 'revolver', 'ammo', 'bong', 'shrooms',
    'whiteLine', 'crookedArt', 'crookedFrame', 'art',
  ]) assert.ok(world.utilityTargets[target], target);

  assert.equal(world.groundAt(0, -4), LUXURY_APARTMENT.loftY);
  assert.equal(world.groundAt(0, 4), LUXURY_APARTMENT.mainY);
  assert.equal(world.toiletFloorY, LUXURY_APARTMENT.loftY);
  assert.ok(world.toiletBowl.isVector3);
  assert.ok(world.toiletCollider?.isBox3);
  assert.ok(world.showerHead.isVector3 && world.showerStand.isVector3);
  assert.equal(world.artTargets['luxury.night-watch'].userData.artAspect, 1.5);
  assert.equal(world.artTargets['luxury.ascension'].userData.artAspect, 2 / 3);

  const footsteps = new Player(new THREE.PerspectiveCamera(), world);
  assert.equal(footsteps.surfaceAt(new THREE.Vector3(2, 0, 2)), 'rug');
  assert.equal(footsteps.surfaceAt(new THREE.Vector3(8, 0, 2)), 'tile');
  assert.equal(footsteps.surfaceAt(new THREE.Vector3(-4, LUXURY_APARTMENT.loftY, -6)), 'tile');

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

test('luxury authored polish includes a deep two-facade skyline, lighting and usable seating', async () => {
  const { world } = await build();
  assert.ok(world.metrics.cityBuildings >= 14);
  assert.ok(world.metrics.cityDepthBands >= 3);
  assert.ok(world.metrics.cityMinimumSetback >= 12);
  assert.ok(world.metrics.cityWindowsSouth >= 100);
  assert.ok(world.metrics.cityWindowsEast >= 100);
  assert.ok(world.metrics.cityRoofFeatures >= world.metrics.cityBuildings);

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
  assert.equal(primaryCouch.intersectsBox(returnCouch), true, 'sectional pieces join at the corner');

  assert.equal(world.gameStations.arcade.seat.name, 'luxury-arcade-stool');
  assert.ok(colliderNamed(world, 'luxury-arcade-stool-collider'));
  assert.equal(world.gameStations.poker.seats.length, 4);
  for (const seat of world.gameStations.poker.seats) {
    assert.ok(colliderNamed(world, `${seat.name}-collider`), seat.name);
  }

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
  const { world, registered } = await build({
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

  assert.equal(world.setShades(true), true);
  for (let i = 0; i < 30; i++) world.update(1 / 60, i / 60);
  assert.ok(world.state.shadesT > 0.8);
  assert.ok(world.shades.south.every((shade) => shade.scale.y > 0.8));

  world.doors.front.open();
  world.update(0.1, 1);
  assert.equal(world.state.frontDoorOpen, true);
  world.doors.front.close();
  assert.equal(world.state.frontDoorOpen, false);

  world.dispose();
});

test('luxury styling owns the standalone hub surfaces', () => {
  for (const selector of [
    'body.luxury-apartment', '#luxury-grade', '#luxury-vignette', '#luxury-rest',
    '#luxury-game-panel', 'body.luxury-apartment #overlay', 'body.luxury-apartment #loading',
  ]) assert.ok(cssSource.includes(selector), selector);
});
