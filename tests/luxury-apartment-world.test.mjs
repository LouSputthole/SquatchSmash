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
  LUXURY_EXTRA_ART_SLOTS,
  buildLuxuryApartment,
} = worldModule;
const { WALL_SLOTS, BATH_SLOTS } = apartmentModule;
const { validateLuxuryWorld } = runtimeModule;
const { Player } = playerModule;

const worldSource = readFileSync(new URL('../src/luxury-apartment/world.js', import.meta.url), 'utf8');
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

test('luxury world keeps every apartment art seam and reserves new hero slots', () => {
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
  assert.match(worldSource, /slot === 'luxury\.night-watch' \? 1\.5/);
  assert.match(worldSource, /slot === 'luxury\.ascension' \? 2 \/ 3/);
});

test('luxury world builds a validated two-floor hub with screens, zones and parity targets', async () => {
  const { world } = await build();
  validateLuxuryWorld(world);

  assert.equal(world.metrics.floors, 2);
  assert.equal(world.metrics.stairSteps, 18);
  assert.ok(world.metrics.doubleHeightMetres >= 6.7);
  assert.ok(world.metrics.panoramicWindowArea >= 200);
  assert.equal(world.metrics.artTargets, LUXURY_ART_SLOTS.length);
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
