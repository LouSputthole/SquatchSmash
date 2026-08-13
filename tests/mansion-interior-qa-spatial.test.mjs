import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as THREE from 'three';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';
import {
  MANSION_ART_EVIDENCE_SHOTS,
  MANSION_OWNER_PICTURE_COUNT,
} from '../tools/mansion-art-evidence-contract.mjs';

ensureThreeShim();
ensureDomShim();

const {
  buildMansionGrounds,
} = await import('../src/mansion/scenes/MansionGrounds.js');
const {
  buildMansionInterior,
} = await import('../src/mansion/scenes/MansionInterior.js');

const grounds = buildMansionGrounds(null);
const interior = buildMansionInterior({ grounds });
interior.root.updateMatrixWorld(true);

function descendantsNamed(parent, name) {
  const found = [];
  parent.traverse((object) => {
    if (object.name === name) found.push(object);
  });
  return found;
}

function xzClear(a, b, clearance = 0.05) {
  const aa = new THREE.Box3().setFromObject(a);
  const bb = new THREE.Box3().setFromObject(b);
  return aa.max.x + clearance <= bb.min.x
    || bb.max.x + clearance <= aa.min.x
    || aa.max.z + clearance <= bb.min.z
    || bb.max.z + clearance <= aa.min.z;
}

function resolvedArt(slot, aspect) {
  return new Map([[slot, {
    real: true,
    aspect,
    texture: new THREE.Texture(),
    file: `${slot}.test-art`,
  }]]);
}

function boxCentre(object) {
  return new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3());
}

test('Mansion ground and interior floor resolvers return the actual rendered support tops', () => {
  const frontEntry = grounds.props.frontEntry;
  assert.equal(typeof frontEntry.groundAt, 'function',
    'the shared front-entry geometry publishes no exact discrete support resolver');
  const frontTreads = descendantsNamed(grounds.root, 'front-entry-tread-0')
    .concat(...Array.from({ length: 5 }, (_, index) => (
      descendantsNamed(grounds.root, `front-entry-tread-${index + 1}`)
    )));
  assert.equal(frontTreads.length, 6);
  for (const tread of frontTreads) {
    const box = new THREE.Box3().setFromObject(tread);
    const centre = box.getCenter(new THREE.Vector3());
    assert.ok(Math.abs(frontEntry.groundAt(centre.x, centre.z) - box.max.y) <= 1e-6,
      `${tread.name} resolves ${(frontEntry.groundAt(centre.x, centre.z) - box.max.y) * 1000} mm from its top`);
  }
  for (const path of ['../src/mansion/main.js', '../src/mansion/siege/main.js']) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(source, /frontEntry\.groundAt|frontEntry\.groundAt\(x, z\)/,
      `${path} does not consume the grounds-owned discrete front-entry resolver`);
  }

  const flatProbes = [
    ['foyer-floor', 4, 40],
    ['gallery-floor', 14, 50],
    ['cellar-hall-floor', null, null],
  ];
  for (const [name, authoredX, authoredZ] of flatProbes) {
    const mesh = interior.root.getObjectByName(name);
    assert.ok(mesh, `missing ${name}`);
    const box = new THREE.Box3().setFromObject(mesh);
    const x = authoredX ?? box.max.x - 0.1;
    const z = authoredZ ?? box.min.z + 0.1;
    assert.ok(Math.abs(interior.floorAt(x, z, box.max.y) - box.max.y) <= 1e-6,
      `${name} floorAt is ${((interior.floorAt(x, z, box.max.y) - box.max.y) * 1000).toFixed(1)} mm from its visible top`);
  }

  const steppedNames = [
    'horseshoe-west-runner', 'horseshoe-east-runner', 'basement-stair-tread',
    'suite-stair-a-runner', 'suite-stair-b-runner', 'suite-stair-landing',
  ];
  for (const name of steppedNames) {
    const pieces = descendantsNamed(interior.root, name);
    assert.ok(pieces.length > 0, `missing ${name}`);
    for (const piece of pieces) {
      const box = new THREE.Box3().setFromObject(piece);
      const centre = boxCentre(piece);
      const resolved = interior.floorAt(centre.x, centre.z, box.max.y);
      assert.ok(Math.abs(resolved - box.max.y) <= 1e-6,
        `${name} at z=${centre.z.toFixed(3)} resolves ${((resolved - box.max.y) * 1000).toFixed(1)} mm from its visible top`);
    }
  }
});

test('every formerly buried Mansion rug is named and above every intersecting opaque floor finish', () => {
  const rugNames = [
    'foyer-threshold-runner', 'foyer-centre-rug', 'living-room-rug',
    'lounge-south-rug', 'lounge-seating-rug', 'dining-room-rug',
    'gallery-runner-rug', 'conference-room-rug', 'office-main-rug',
    'office-small-rug', 'bath-west-mat', 'bath-east-mat',
    'trophy-hall-runner', 'cellar-hall-runner',
  ];
  const floorMeshes = [];
  interior.root.traverse((object) => {
    if (!object.isMesh || object.visible === false) return;
    if (/(floor|mosaic)/.test(object.name ?? '')) floorMeshes.push(object);
  });
  for (const name of rugNames) {
    const rug = interior.root.getObjectByName(name);
    assert.ok(rug?.isMesh, `${name} is missing or not independently auditable`);
    const rugBox = new THREE.Box3().setFromObject(rug);
    const overlaps = floorMeshes.filter((floor) => floor !== rug).map((floor) => ({
      floor,
      box: new THREE.Box3().setFromObject(floor),
    })).filter(({ box }) => box.max.x > rugBox.min.x && box.min.x < rugBox.max.x
      && box.max.z > rugBox.min.z && box.min.z < rugBox.max.z
      && box.max.y <= rugBox.max.y + 0.05 && box.max.y >= rugBox.max.y - 0.05);
    assert.ok(overlaps.length > 0, `${name} has no real floor finish beneath it`);
    const highest = Math.max(...overlaps.map(({ box }) => box.max.y));
    assert.ok(rug.position.y >= highest + 0.001,
      `${name} is ${((highest - rug.position.y) * 1000).toFixed(1)} mm under its highest intersecting finish`);
  }
});

test('every Mansion display trophy is one connected object resting on its case shelf', () => {
  const loungeTrophies = descendantsNamed(interior.root, 'lounge-display-trophy');
  const hallTrophies = descendantsNamed(interior.root, 'trophy-hall-display-trophy');
  assert.equal(loungeTrophies.length, 9, 'the three billiard-room cases do not each hold three complete trophies');
  assert.equal(hallTrophies.length, 8, 'the Great Includer hall cases do not each hold four complete trophies');

  for (const trophy of [...loungeTrophies, ...hallTrophies]) {
    const base = trophy.getObjectByName('display-trophy-base');
    const stem = trophy.getObjectByName('display-trophy-stem');
    const cup = trophy.getObjectByName('display-trophy-cup');
    assert.ok(base && stem && cup, `${trophy.name} is missing a physical base, stem, or cup`);

    const baseBox = new THREE.Box3().setFromObject(base);
    const stemBox = new THREE.Box3().setFromObject(stem);
    const cupBox = new THREE.Box3().setFromObject(cup);
    assert.ok(stemBox.min.y <= baseBox.max.y + 0.012,
      `${trophy.name} has ${(stemBox.min.y - baseBox.max.y).toFixed(3)} m of air above its base`);
    assert.ok(cupBox.min.y <= stemBox.max.y + 0.012,
      `${trophy.name} has ${(cupBox.min.y - stemBox.max.y).toFixed(3)} m of air above its stem`);

    const shelf = trophy.parent?.getObjectByName('display-case-shelf');
    assert.ok(shelf, `${trophy.name} has no physical shelf beneath it`);
    const shelfBox = new THREE.Box3().setFromObject(shelf);
    const trophyBox = new THREE.Box3().setFromObject(trophy);
    assert.ok(Math.abs(trophyBox.min.y - shelfBox.max.y) <= 0.018,
      `${trophy.name} floats ${(trophyBox.min.y - shelfBox.max.y).toFixed(3)} m above its shelf`);
  }
});

test('the lounge shield hangs fully above the back bar instead of being buried by it', () => {
  const dressedInterior = buildMansionInterior({ grounds });
  assert.equal(typeof dressedInterior.applyResolvedArt, 'function',
    'the focused test cannot exercise the same aspect-resize path as production art dressing');
  assert.deepEqual(dressedInterior.applyResolvedArt(resolvedArt('mansion.bay.shield', 675 / 900)),
    ['mansion.bay.shield']);
  dressedInterior.root.updateMatrixWorld(true);

  const shield = dressedInterior.props.lounge.bayShield;
  const backBar = dressedInterior.root.getObjectByName('back-bar');
  const shieldFrame = dressedInterior.root.getObjectByName('bay-shield-frame');
  assert.ok(shield && backBar && shieldFrame, 'the lounge shield, frame, or back bar is missing');
  const shieldBox = new THREE.Box3().setFromObject(shield);
  const barBox = new THREE.Box3().setFromObject(backBar);
  assert.ok(shieldBox.min.y >= barBox.max.y + 0.12,
    `the shield starts ${(shieldBox.min.y - barBox.max.y).toFixed(3)} m above the back bar; it needs visible wall around it`);
  const frameBox = new THREE.Box3().setFromObject(shieldFrame);
  assert.ok(frameBox.min.y >= barBox.max.y + 0.12,
    `the dressed shield frame starts only ${(frameBox.min.y - barBox.max.y).toFixed(3)} m above the back bar`);
  const shieldCenter = shieldBox.getCenter(new THREE.Vector3());
  const frameCenter = frameBox.getCenter(new THREE.Vector3());
  assert.ok(shieldCenter.distanceTo(frameCenter) <= 0.08,
    `the shield is ${shieldCenter.distanceTo(frameCenter).toFixed(3)} m off-center from its backing frame`);
});

test('the kitchen refrigerator faces into the room and the microwave reads as a complete appliance', () => {
  const refrigerator = interior.props.kitchen.refrigerator;
  const microwave = interior.props.kitchen.microwave;
  assert.ok(refrigerator, 'the kitchen refrigerator is not exposed as one complete appliance');
  assert.ok(microwave, 'the kitchen has no microwave');

  const fridgeSize = new THREE.Box3().setFromObject(refrigerator).getSize(new THREE.Vector3());
  assert.ok(fridgeSize.z > fridgeSize.x,
    `the refrigerator is still turned sideways (${fridgeSize.x.toFixed(2)} m deep x ${fridgeSize.z.toFixed(2)} m wide)`);
  assert.ok(fridgeSize.y >= 2.1 && fridgeSize.z >= 0.95,
    `the refrigerator is still undersized (${fridgeSize.z.toFixed(2)} m x ${fridgeSize.y.toFixed(2)} m)`);
  assert.equal(descendantsNamed(refrigerator, 'kitchen-fridge-door').length, 2,
    'the refrigerator needs two readable front doors');
  assert.equal(descendantsNamed(refrigerator, 'kitchen-fridge-handle').length, 2,
    'the refrigerator needs a handle on each door');

  for (const part of ['microwave-window', 'microwave-door-handle', 'microwave-control-panel', 'microwave-display']) {
    assert.ok(microwave.getObjectByName(part), `the microwave is missing its ${part}`);
  }
  assert.ok(descendantsNamed(microwave, 'microwave-button').length >= 8,
    'the microwave control panel needs a readable button grid');
});

test('every winter-garden planter is deliberately separated from the fountain', () => {
  const { plants, pool } = interior.props.winterGarden;
  assert.equal(plants?.length, 5, 'winter-garden planters are not exposed as complete movable props');
  for (const planter of plants) {
    const world = planter.getWorldPosition(new THREE.Vector3());
    const distance = Math.hypot(world.x - pool.x, world.z - pool.z);
    const footprint = planter.userData.footprintRadius;
    assert.ok(Number.isFinite(footprint), 'a winter-garden planter has no footprint contract');
    assert.ok(distance >= pool.r + footprint + 0.18,
      `${planter.name} overlaps the fountain clearance by ${(pool.r + footprint + 0.18 - distance).toFixed(3)} m`);
  }

  const fountainStructure = [
    ...descendantsNamed(interior.root, 'winter-fountain-kerb'),
    interior.root.getObjectByName('winter-fountain-pedestal'),
    interior.root.getObjectByName('winter-fountain-bowl'),
  ];
  assert.equal(fountainStructure.filter(Boolean).length, 10,
    'the eight kerbs and two fountain-body meshes are not published as actual structure');
  const planGap = (a, b) => {
    const aa = new THREE.Box3().setFromObject(a);
    const bb = new THREE.Box3().setFromObject(b);
    const dx = Math.max(0, aa.min.x - bb.max.x, bb.min.x - aa.max.x);
    const dz = Math.max(0, aa.min.z - bb.max.z, bb.min.z - aa.max.z);
    return Math.hypot(dx, dz);
  };
  for (const planter of plants) {
    for (const fountainPart of fountainStructure) {
      const gap = planGap(planter, fountainPart);
      assert.ok(gap >= 0.1,
        `${planter.name} has only ${gap.toFixed(3)} m of actual mesh clearance from ${fountainPart?.name}`);
    }
  }
});

test('the Great Includer reads as one clear monument without statues or floor lamps crowding it', () => {
  const hall = interior.props.trophyHall;
  const handles = descendantsNamed(hall.trophy, 'great-includer-handle');
  assert.equal(handles.length, 2, 'the Great Includer needs two identifiable handles');
  const cup = hall.trophy.getObjectByName('great-includer-cup');
  assert.ok(cup, 'the Great Includer cup body has no geometry contract');
  const cupBox = new THREE.Box3().setFromObject(cup);
  for (const handle of handles) {
    assert.ok(Math.abs(handle.rotation.x) <= 0.05,
      'a Great Includer handle is lying flat instead of standing upright');
    assert.ok(Math.abs(handle.geometry.parameters.arc - Math.PI * 2) <= 0.001,
      'a Great Includer handle is an open fragment instead of a complete loop');
    assert.ok(new THREE.Box3().setFromObject(handle).intersectsBox(cupBox),
      'a Great Includer handle floats clear of the cup body');
  }
  assert.deepEqual(hall.statues, [], 'the two unrelated statues remain in the Trophy Hall');
  assert.deepEqual(hall.floorLights, [], 'physical floor lamps still crowd the trophy monument');
});

test('the family-room fireplace visibly burns and its wall has a curated picture group', () => {
  const living = interior.props.livingRoom;
  assert.ok(living.fireGlow?.intensity > 0 && living.fireGlow.distance >= 18,
    'the family-room fire has no room-scale practical glow');
  assert.ok(living.flames?.length >= 4, 'the fireplace has embers but no visible flame geometry');
  for (const flame of living.flames) {
    assert.ok(flame.material.emissive?.getHex() > 0, 'a fireplace flame is not emissive');
  }
  assert.ok(living.galleryArt?.length >= 2, 'the family room needs a deliberate secondary picture group');
  const flame = living.flames[0];
  const before = `${flame.position.y}:${flame.scale.y}`;
  living.updateFire(0.1);
  assert.notEqual(`${flame.position.y}:${flame.scale.y}`, before,
    'the family-room flame geometry is completely static');
});

test('all four bedrooms have exterior placards and deliberately separated furniture clusters', () => {
  const rooms = interior.props.bedrooms;
  const placements = [
    ['westFront', interior.rooms.bedWestFront.rect, 'north', 'old-chapel-room-placard'],
    ['eastFront', interior.rooms.bedEastFront.rect, 'north', 'old-country-room-placard'],
    ['westRear', interior.rooms.bedWestRear.rect, 'south', 'lake-room-placard'],
    ['eastRear', interior.rooms.bedEastRear.rect, 'south', 'booski-death-room-exterior-placard'],
  ];
  for (const [id, rect, wall, name] of placements) {
    const placard = rooms[id].placard;
    assert.equal(placard?.name, name, `${id} has no correctly named room placard`);
    const pz = placard.getWorldPosition(new THREE.Vector3()).z;
    assert.ok(wall === 'north' ? pz > rect.z1 : pz < rect.z0,
      `${name} is still mounted inside the bedroom instead of over its gallery-side doorway`);
    const placardBox = new THREE.Box3().setFromObject(placard);
    assert.ok(placardBox.min.y >= 8.5, `${name} hangs in the doorway instead of above it`);
  }

  const lakePlacard = rooms.westRear.placard;
  const lakePlacardFrame = interior.root.getObjectByName('lake-room-placard-frame');
  assert.ok(lakePlacardFrame, 'the Lake-room exterior placard has no physical frame');
  const lakePlacardBox = new THREE.Box3().setFromObject(lakePlacard);
  const lakePlacardFrameBox = new THREE.Box3().setFromObject(lakePlacardFrame);
  const lakePlacardWallBoxes = descendantsNamed(interior.root, 'gallery-north-solid')
    .map((wall) => new THREE.Box3().setFromObject(wall))
    .filter((wallBox) => (
      wallBox.max.x >= lakePlacardFrameBox.min.x && wallBox.min.x <= lakePlacardFrameBox.max.x
      && wallBox.max.y >= lakePlacardFrameBox.min.y && wallBox.min.y <= lakePlacardFrameBox.max.y
    ));
  assert.ok(lakePlacardWallBoxes.length > 0,
    'the Lake-room placard test cannot resolve the actual named wall behind it');
  const gallerySideClearance = (partBox) => Math.min(...lakePlacardWallBoxes
    .map((wallBox) => wallBox.min.z - partBox.max.z));
  const lakePlacardClearance = gallerySideClearance(lakePlacardBox);
  const lakePlacardFrameClearance = gallerySideClearance(lakePlacardFrameBox);
  assert.ok(lakePlacardClearance >= 0.002 && lakePlacardFrameClearance >= 0.002,
    `the Lake-room placard remains inside the actual gallery wall (plane ${lakePlacardClearance.toFixed(3)} m, frame ${lakePlacardFrameClearance.toFixed(3)} m)`);
  assert.ok(lakePlacardFrameClearance <= 0.005,
    `the Lake-room placard frame floats ${lakePlacardFrameClearance.toFixed(3)} m off the actual gallery wall`);

  const gothic = rooms.westFront;
  const gothicWardrobe = interior.root.getObjectByName('bed-west-front-wardrobe');
  assert.ok(xzClear(gothic.chair, gothicWardrobe, 0.18), 'the Gothic chair crowds the wardrobe');
  assert.ok(xzClear(gothic.sideTable, gothic.bed, 0.15), 'the Gothic side table intersects the bed');
  assert.ok(xzClear(gothic.cluster.root, gothicWardrobe, 0.08), 'the Gothic packing cluster intersects the wardrobe');

  const classic = rooms.eastFront;
  const classicWardrobe = interior.root.getObjectByName('bed-east-front-wardrobe');
  assert.ok(xzClear(classic.chair, classicWardrobe, 0.18), 'the old-timey chair crowds the wardrobe');
  assert.ok(xzClear(classic.sideTable, classic.bed, 0.15), 'the old-timey pedestal intersects the bed');
  assert.ok(Math.abs(classic.tv.rotation.y) >= 0.2, 'the old-timey television is still flat to the wall instead of angled');
  const weightCenter = new THREE.Box3().setFromObject(classic.weightSet).getCenter(new THREE.Vector3());
  assert.ok(weightCenter.x >= 14.5 && weightCenter.z >= 44.5,
    'the old-timey weight set is not in the back window corner');

  const lake = rooms.westRear;
  assert.ok(xzClear(lake.chair, lake.cluster.root, 0.18), 'the lake-room chair crowds the writing cluster');
  assert.ok(xzClear(lake.sideTable, lake.cluster.root, 0.18), 'the lake-room side table crowds the writing desk');
  const lakeRect = interior.rooms.bedWestRear.rect;
  const lakeFloor = interior.rooms.bedWestRear.floor;
  const lakePlants = descendantsNamed(interior.root, 'plant').filter((plant) => {
    const world = plant.getWorldPosition(new THREE.Vector3());
    return Math.abs(world.y - lakeFloor) <= 0.1
      && world.x >= lakeRect.x0 && world.x <= lakeRect.x1
      && world.z >= lakeRect.z0 && world.z <= lakeRect.z1;
  });
  assert.equal(lakePlants.length, 0,
    `a plant still occupies the Lake-room little-table/furniture zone: ${lakePlants.map(({ position }) => `${position.x},${position.y},${position.z}`).join('; ')}`);
  const lakeWallBoxes = descendantsNamed(interior.root, 'gallery-north-solid')
    .map((wall) => new THREE.Box3().setFromObject(wall));
  const wallGap = (decoration) => {
    const decorationBox = new THREE.Box3().setFromObject(decoration);
    const actualWall = lakeWallBoxes.filter((wallBox) => (
      wallBox.max.x >= decorationBox.min.x && wallBox.min.x <= decorationBox.max.x
      && wallBox.max.y >= decorationBox.min.y && wallBox.min.y <= decorationBox.max.y
    ));
    assert.ok(actualWall.length > 0,
      `${decoration.name || 'lake wall decoration'} has no actual gallery-north-solid wall behind it`);
    assert.ok(actualWall.every((wallBox) => !wallBox.intersectsBox(decorationBox)),
      `${decoration.name || 'lake wall decoration'} penetrates the actual bedroom wall`);
    return Math.min(...actualWall.map((wallBox) => Math.max(
      0,
      decorationBox.min.z - wallBox.max.z,
      wallBox.min.z - decorationBox.max.z,
    )));
  };
  const paddles = descendantsNamed(interior.root, 'lake-paddle');
  const lifeRing = interior.root.getObjectByName('lake-life-ring');
  for (const decoration of [lake.artFrame.group, ...paddles, lifeRing]) {
    const gap = wallGap(decoration);
    assert.ok(gap <= 0.005,
      `${decoration.name || 'lake wall decoration'} floats ${gap.toFixed(3)} m off the actual wall`);
  }

  const whiteCross = lake.whiteCross;
  assert.equal(whiteCross?.name, 'lake-white-cross', 'the requested white cross is missing from the Lake room');
  const crossVertical = whiteCross?.getObjectByName('lake-white-cross-vertical');
  const crossHorizontal = whiteCross?.getObjectByName('lake-white-cross-horizontal');
  assert.ok(crossVertical && crossHorizontal,
    'the Lake-room cross is not a recognizable connected vertical/horizontal cross');
  assert.ok(new THREE.Box3().setFromObject(crossVertical)
    .intersectsBox(new THREE.Box3().setFromObject(crossHorizontal)),
  'the Lake-room cross has disconnected pieces');
  assert.ok(wallGap(whiteCross) <= 0.005, 'the white cross is not flush to the actual Lake-room wall');
  for (const adjacent of [lake.artFrame.group, ...paddles, lifeRing, lake.bed]) {
    assert.ok(!new THREE.Box3().setFromObject(whiteCross)
      .intersectsBox(new THREE.Box3().setFromObject(adjacent)),
    `the white cross intersects ${adjacent.name || 'adjacent Lake-room decor'}`);
  }

  const modern = rooms.eastRear;
  assert.ok(xzClear(modern.sideTable, modern.cluster.inventory[0], 0.18),
    'the modern-room side table intersects the dressing bench');
  const modernWardrobe = interior.root.getObjectByName('bed-east-rear-wardrobe');
  assert.deepEqual(modern.identity.accentPortraits.map(({ name }) => name),
    ['booski-death-room-booski-accent'],
    'the reported DeathMegatron accent picture was moved instead of removed');
  assert.equal(interior.root.getObjectByName('booski-death-room-deathmegatron-accent'), undefined,
    'the hidden DeathMegatron accent picture still exists in the room graph');
  for (const portrait of modern.identity.accentPortraits) {
    assert.ok(xzClear(portrait, modernWardrobe, 0.2),
      `${portrait.name} is still hidden behind the wardrobe`);
  }
});

test('Uncle Lou suite has one low bar light and no decorative beam crossing the room', () => {
  assert.equal(descendantsNamed(interior.root, 'suite-ceiling-beam').length, 0,
    'the unnecessary suite beam still crosses the tables and room');
  const barLights = descendantsNamed(interior.root, 'suite-bar-wall-light');
  assert.equal(barLights.length, 1, 'the left side of Lou bar does not have exactly one fixture');
  assert.equal(interior.props.masterSuite.barLight, barLights[0], 'the suite does not publish its single bar light');
  const height = barLights[0].getWorldPosition(new THREE.Vector3()).y - interior.rooms.masterSuite.floor;
  assert.ok(height <= 2.6, `the remaining suite bar light is still too high (${height.toFixed(2)} m)`);
});

test('the upper balcony railing is physically continuous from each stair top around the bay', () => {
  const chain = [
    ['horseshoe-west-rail', 'gallery-edge-west-rail'],
    ['gallery-edge-west-rail', 'balcony-west-rail'],
    ['balcony-west-rail', 'balcony-south-rail'],
    ['balcony-south-rail', 'balcony-east-rail'],
    ['balcony-east-rail', 'gallery-edge-east-rail'],
    ['gallery-edge-east-rail', 'horseshoe-east-rail'],
  ];
  for (const [fromName, toName] of chain) {
    const from = interior.root.getObjectByName(fromName);
    const to = interior.root.getObjectByName(toName);
    assert.ok(from && to, `missing ${fromName} or ${toName}`);
    assert.ok(new THREE.Box3().setFromObject(from).intersectsBox(new THREE.Box3().setFromObject(to)),
      `there is a physical gap between ${fromName} and ${toName}`);
  }
});

test('the cellar work wall, wine rack, and vault mark are mounted and visually complete', () => {
  const dressedInterior = buildMansionInterior({ grounds });
  assert.equal(typeof dressedInterior.applyResolvedArt, 'function',
    'the focused test cannot exercise the same aspect-resize path as production art dressing');
  assert.deepEqual(dressedInterior.applyResolvedArt(resolvedArt('mansion.vault.mark', 1)),
    ['mansion.vault.mark']);
  dressedInterior.root.updateMatrixWorld(true);

  const basement = dressedInterior.props.basement;
  const pegboard = basement.toolBench?.pegboard;
  assert.ok(pegboard, 'the object above the cellar workbench is not an identifiable pegboard');
  const pegboardBox = new THREE.Box3().setFromObject(pegboard);
  const northWall = dressedInterior.root.getObjectByName('basement-wall-panel-north');
  assert.ok(northWall, 'the pegboard check cannot resolve the actual named cellar wall panel');
  const northWallBox = new THREE.Box3().setFromObject(northWall);
  assert.ok(northWallBox.max.x >= pegboardBox.min.x && northWallBox.min.x <= pegboardBox.max.x
    && northWallBox.max.y >= pegboardBox.min.y && northWallBox.min.y <= pegboardBox.max.y,
  'the pegboard is not mounted over the actual cellar wall panel');
  assert.ok(pegboardBox.max.z <= northWallBox.min.z + 0.001,
    `the workbench pegboard penetrates the actual wall by ${(pegboardBox.max.z - northWallBox.min.z).toFixed(3)} m`);
  assert.ok(Math.abs(pegboardBox.max.z - northWallBox.min.z) <= 0.005,
    `the workbench pegboard floats ${(northWallBox.min.z - pegboardBox.max.z).toFixed(3)} m off the actual wall`);
  assert.ok(basement.toolBench.tools.every((tool) => new THREE.Box3().setFromObject(tool).intersectsBox(pegboardBox)),
    'a workbench tool floats in front of the pegboard');

  assert.equal(basement.wineBottles?.length, 18, 'the cellar wine rack does not hold eighteen complete bottles');
  for (const bottle of basement.wineBottles) {
    for (const part of ['cellar-wine-body', 'cellar-wine-shoulder', 'cellar-wine-neck', 'cellar-wine-cork', 'cellar-wine-label']) {
      assert.ok(bottle.getObjectByName(part), `${bottle.name} is missing ${part}`);
    }
  }

  const vaultMarkBox = new THREE.Box3().setFromObject(dressedInterior.props.vault.mark);
  const vaultWallClearances = descendantsNamed(dressedInterior.root, 'cellar-rooms-solid')
    .map((wall) => new THREE.Box3().setFromObject(wall))
    .filter((wallBox) => (
      wallBox.max.x >= vaultMarkBox.min.x && wallBox.min.x <= vaultMarkBox.max.x
      && wallBox.max.y >= vaultMarkBox.min.y && wallBox.min.y <= vaultMarkBox.max.y
    ))
    .map((wallBox) => Math.max(
      0,
      wallBox.min.z - vaultMarkBox.max.z,
      vaultMarkBox.min.z - wallBox.max.z,
    ));
  assert.ok(vaultWallClearances.length > 0,
    'the vault-art check did not resolve the actual cellar-rooms-solid wall');
  assert.ok(vaultWallClearances.every((clearance) => clearance >= 0.025),
    `the vault mark remains embedded in actual cellar structure (${Math.min(...vaultWallClearances).toFixed(3)} m clearance)`);
  const visibleIntersections = [];
  dressedInterior.root.traverse((object) => {
    if (!object.isMesh || object.isInstancedMesh || object === dressedInterior.props.vault.mark || !object.visible) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (materials.every((material) => material?.transparent && material.opacity <= 0.001)) return;
    if (new THREE.Box3().setFromObject(object).intersectsBox(vaultMarkBox)) {
      visibleIntersections.push(object.name || '(unnamed)');
    }
  });
  assert.deepEqual(visibleIntersections, [],
    `actual visible geometry still passes through the vault picture: ${visibleIntersections.join(', ')}`);

  const vaultJambBoxes = descendantsNamed(dressedInterior.root, 'cellar-rooms-case')
    .map((object) => new THREE.Box3().setFromObject(object))
    .filter((box) => box.max.y >= vaultMarkBox.min.y && box.min.y <= vaultMarkBox.max.y);
  const nearestJambGap = Math.min(...vaultJambBoxes.map((box) => Math.max(
    0,
    box.min.x - vaultMarkBox.max.x,
    vaultMarkBox.min.x - box.max.x,
  )));
  assert.ok(nearestJambGap >= 0.08,
    `the vault picture remains only ${nearestJambGap.toFixed(3)} m from an actual white doorway jamb`);
  assert.ok(vaultMarkBox.min.x >= dressedInterior.rooms.vault.rect.x0 + 0.1
    && vaultMarkBox.max.x <= dressedInterior.rooms.vault.rect.x1 - 0.1,
  'the relocated vault mark runs through a vault side wall');
});

test('the Casa Bonita picture across from the vault clears the white cellar chair rail', () => {
  const dressedInterior = buildMansionInterior({ grounds });
  assert.deepEqual(
    dressedInterior.applyResolvedArt(resolvedArt('mansion.cellar.crest', 768 / 1024)),
    ['mansion.cellar.crest'],
  );
  dressedInterior.root.updateMatrixWorld(true);

  const picture = dressedInterior.props.cellarHall.crest;
  const pictureBox = new THREE.Box3().setFromObject(picture);
  const framePanel = picture.parent?.name === 'framePanel' ? picture.parent : null;
  const frame = framePanel?.parent?.name === 'frame' ? framePanel.parent : null;
  assert.ok(frame, 'Casa Bonita is still an unframed plane floating across from the vault');
  const frameBoxes = framePanel.children
    .filter((child) => child.isMesh && child.geometry?.type === 'BoxGeometry')
    .sort((a, b) => (b.geometry.parameters?.depth ?? 0) - (a.geometry.parameters?.depth ?? 0));
  const [bezel, board] = frameBoxes;
  assert.ok(bezel && board, 'Casa Bonita has no real bezel and mount board around the delivered art');
  const bezelBox = new THREE.Box3().setFromObject(bezel);
  const boardBox = new THREE.Box3().setFromObject(board);
  const fullFrameBox = new THREE.Box3().setFromObject(framePanel);
  const boardMargins = {
    left: pictureBox.min.x - boardBox.min.x,
    right: boardBox.max.x - pictureBox.max.x,
    bottom: pictureBox.min.y - boardBox.min.y,
    top: boardBox.max.y - pictureBox.max.y,
  };
  const bezelMargins = {
    left: pictureBox.min.x - bezelBox.min.x,
    right: bezelBox.max.x - pictureBox.max.x,
    bottom: pictureBox.min.y - bezelBox.min.y,
    top: bezelBox.max.y - pictureBox.max.y,
  };
  assert.ok(boardMargins.left >= 0.0055 && boardMargins.right >= 0.0055
    && boardMargins.bottom >= 0.0055 && boardMargins.top >= 0.0055,
    `Casa Bonita protrudes past its mount board: ${JSON.stringify(boardMargins)}`);
  assert.ok(bezelMargins.left >= 0.0345 && bezelMargins.right >= 0.0345
    && bezelMargins.bottom >= 0.0345 && bezelMargins.top >= 0.0345,
  `Casa Bonita does not have a complete four-sided bezel: ${JSON.stringify(bezelMargins)}`);
  assert.ok(Math.abs(boardMargins.left - boardMargins.right) <= 0.0005
    && Math.abs(boardMargins.bottom - boardMargins.top) <= 0.0005
    && Math.abs(bezelMargins.left - bezelMargins.right) <= 0.0005
    && Math.abs(bezelMargins.bottom - bezelMargins.top) <= 0.0005,
  `Casa Bonita is asymmetric inside its frame: board=${JSON.stringify(boardMargins)} bezel=${JSON.stringify(bezelMargins)}`);
  const intersectingWhiteTrim = [];
  const whiteRailClearances = [];
  dressedInterior.root.traverse((object) => {
    if (!object.isMesh || object.isInstancedMesh || object === picture || !object.visible) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (!materials.some((material) => material?.color?.getHex() === 0xf0e9d8)) return;
    const trimBox = new THREE.Box3().setFromObject(object);
    if (trimBox.intersectsBox(fullFrameBox)) {
      intersectingWhiteTrim.push({
        name: object.name || '(unnamed white trim)',
        minY: trimBox.min.y,
        maxY: trimBox.max.y,
      });
    }
    const trimSize = trimBox.getSize(new THREE.Vector3());
    const sharesWallRun = trimBox.max.x >= fullFrameBox.min.x && trimBox.min.x <= fullFrameBox.max.x
      && trimBox.max.z >= fullFrameBox.min.z - 0.01 && trimBox.min.z <= fullFrameBox.max.z + 0.01;
    if (sharesWallRun && trimSize.y <= 0.12 && trimBox.max.y <= fullFrameBox.min.y) {
      whiteRailClearances.push(fullFrameBox.min.y - trimBox.max.y);
    }
  });

  assert.deepEqual(
    intersectingWhiteTrim,
    [],
    `white cellar trim still cuts through Casa Bonita: ${JSON.stringify(intersectingWhiteTrim)}`,
  );
  assert.ok(whiteRailClearances.length > 0, 'the Casa Bonita check did not resolve the actual white cellar rail');
  assert.ok(Math.min(...whiteRailClearances) >= 0.05,
    `Casa Bonita's full frame has only ${Math.min(...whiteRailClearances).toFixed(3)} m above the white cellar rail`);

  const wall = descendantsNamed(grounds.root, 'cellar-wing-south')
    .map((object) => ({ object, box: new THREE.Box3().setFromObject(object) }))
    .find(({ box }) => box.max.x >= fullFrameBox.max.x && box.min.x <= fullFrameBox.min.x
      && box.max.y >= fullFrameBox.max.y && box.min.y <= fullFrameBox.min.y);
  assert.ok(wall, 'the Casa Bonita mount check did not resolve the actual cellar south wall');
  const rearGap = bezelBox.min.z - wall.box.max.z;
  assert.ok(rearGap >= -0.0005 && rearGap <= 0.005,
    `Casa Bonita's real frame rear is ${(rearGap * 1000).toFixed(1)} mm from its cellar wall`);
});

test('all ten owner pictures are wall-mounted, volume-clear, and core-readable from the proof camera', () => {
  const ownerShots = MANSION_ART_EVIDENCE_SHOTS.slice(0, MANSION_OWNER_PICTURE_COUNT);
  const targets = new Map([
    ['mansion.gallery.roster', interior.props.gallery.roster],
    ['mansion.ballroom.major', interior.props.ballroom.major],
    ['mansion.lounge.cowboy', interior.props.lounge.cowboy?.art],
    ['mansion.conference.stacks', interior.props.conference.stacks?.art],
    ['mansion.office.boss', interior.props.office.boss?.art],
    ['mansion.winter.almighty', interior.props.winterGarden.almighty?.art],
    ['mansion.cellar.bus', interior.props.cellarHall.bus?.art],
    ['mansion.guest.dog', interior.props.guestRoom.dog?.art],
    ['mansion.theatre.lockup', interior.props.theatre.lockup],
    ['mansion.lan.denver', interior.props.lanRoom.denver],
  ]);
  const sceneMeshes = [];
  const sceneCollisionVolumes = [];
  const sightlineMeshes = [];
  for (const sceneRoot of [grounds.root, interior.root]) {
    sceneRoot.updateMatrixWorld(true);
    sceneRoot.traverse((object) => {
      if (object.isMesh && !object.isInstancedMesh && object.visible) {
        sceneMeshes.push(object);
        sceneCollisionVolumes.push({
          mesh: object,
          instanceId: null,
          box: new THREE.Box3().setFromObject(object),
        });
      } else if (object.isInstancedMesh && object.visible) {
        object.geometry.computeBoundingBox();
        const matrix = new THREE.Matrix4();
        for (let instanceId = 0; instanceId < object.count; instanceId += 1) {
          object.getMatrixAt(instanceId, matrix);
          matrix.premultiply(object.matrixWorld);
          sceneCollisionVolumes.push({
            mesh: object,
            instanceId,
            box: object.geometry.boundingBox.clone().applyMatrix4(matrix),
          });
        }
      }
      if (object.isMesh && !object.isSkinnedMesh && object.geometry && object.material) {
        sightlineMeshes.push(object);
      }
    });
  }

  const projection = (box, normal) => {
    const values = [];
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) values.push(normal.dot(new THREE.Vector3(x, y, z)));
      }
    }
    return { min: Math.min(...values), max: Math.max(...values) };
  };
  const tangentContains = (outer, inner, normal, tolerance = 0.006) => Math.abs(normal.x) > 0.9
    ? outer.min.y <= inner.min.y + tolerance && outer.max.y >= inner.max.y - tolerance
      && outer.min.z <= inner.min.z + tolerance && outer.max.z >= inner.max.z - tolerance
    : outer.min.y <= inner.min.y + tolerance && outer.max.y >= inner.max.y - tolerance
      && outer.min.x <= inner.min.x + tolerance && outer.max.x >= inner.max.x - tolerance;
  const tangentSize = (box, normal) => Math.abs(normal.x) > 0.9
    ? [box.max.y - box.min.y, box.max.z - box.min.z]
    : [box.max.y - box.min.y, box.max.x - box.min.x];
  const shown = (object) => {
    for (let node = object; node; node = node.parent) if (node.visible === false) return false;
    return true;
  };
  const opaque = (object) => {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    return materials.some((material) => material?.visible !== false
      && (!material.transparent || (material.opacity ?? 1) >= 0.5));
  };

  const rows = ownerShots.map((shot) => {
    const art = targets.get(shot.slot);
    assert.ok(art, `${shot.slot} has no built art mesh`);
    art.updateWorldMatrix(true, false);
    const normal = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(art.getWorldQuaternion(new THREE.Quaternion())).normalize();
    const artBox = new THREE.Box3().setFromObject(art);
    const artProjection = projection(artBox, normal);
    const family = new Set();
    let ancestor = art;
    while (ancestor && ancestor !== interior.root) {
      family.add(ancestor);
      ancestor = ancestor.parent;
    }
    const panel = art.parent?.name === 'framePanel' ? art.parent : null;
    const bezel = panel?.children
      .filter((child) => child.isMesh && child.geometry?.type === 'BoxGeometry')
      .sort((a, b) => (b.geometry.parameters?.depth ?? 0) - (a.geometry.parameters?.depth ?? 0))[0] ?? null;
    let mount = bezel;
    let mountKind = bezel ? 'makeFrame-bezel' : 'missing';
    if (!mount) {
      const artTangents = tangentSize(artBox, normal);
      mount = sceneMeshes
        .map((mesh) => ({ mesh, box: new THREE.Box3().setFromObject(mesh) }))
        .filter(({ mesh, box }) => mesh !== art && !family.has(mesh)
          && mesh.geometry?.type === 'BoxGeometry'
          && tangentContains(box, artBox, normal)
          && projection(box, normal).max <= artProjection.min + 0.006
          && tangentSize(box, normal).every((size, index) => size <= artTangents[index] + 0.4)
          && projection(box, normal).max - projection(box, normal).min <= 0.08)
        .sort((a, b) => projection(b.box, normal).max - projection(a.box, normal).max)[0]?.mesh ?? null;
      if (mount) mountKind = 'manual-backing';
    }
    const mountBox = mount ? new THREE.Box3().setFromObject(mount) : artBox;
    if (mount) family.add(mount);
    const ownMountMeshes = new Set([art]);
    if (panel) {
      panel.traverse((object) => {
        if (object.isMesh) ownMountMeshes.add(object);
      });
    } else if (mount) {
      ownMountMeshes.add(mount);
    }
    const fullMountBox = panel
      ? new THREE.Box3().setFromObject(panel)
      : new THREE.Box3().copy(artBox).union(mountBox);
    const mountProjection = projection(mountBox, normal);
    const wall = sceneMeshes
      .map((mesh) => ({ mesh, box: new THREE.Box3().setFromObject(mesh) }))
      .filter(({ mesh, box }) => mesh !== art && mesh !== mount && !family.has(mesh)
        && tangentContains(box, fullMountBox, normal, 0.0005)
        && projection(box, normal).max <= artProjection.min + 0.006
        && projection(box, normal).max - projection(box, normal).min >= 0.035)
      .sort((a, b) => projection(b.box, normal).max - projection(a.box, normal).max)[0] ?? null;
    assert.ok(wall, `${shot.slot} has no intended wall behind its complete visible area`);
    const signedRearGap = mountProjection.min - projection(wall.box, normal).max;
    const occluders = sceneCollisionVolumes
      .filter(({ mesh }) => !ownMountMeshes.has(mesh) && mesh !== wall.mesh)
      .map(({ mesh, instanceId, box }) => {
        const overlap = new THREE.Box3().copy(fullMountBox)
          .intersect(box);
        const size = overlap.getSize(new THREE.Vector3());
        return {
          mesh,
          instanceId,
          overlap: size,
        };
      })
      .filter(({ overlap }) => overlap.x > 0.0005
        && overlap.y > 0.0005 && overlap.z > 0.0005)
      .map(({ mesh, instanceId, overlap }) => ({
        name: mesh.name || '(unnamed finish)',
        parent: mesh.parent?.name || '(unnamed parent)',
        instanceId,
        overlap: overlap.toArray().map((value) => Number(value.toFixed(4))),
      }));
    const centre = artBox.getCenter(new THREE.Vector3());
    const eye = new THREE.Vector3(shot.position[0], shot.position[1] + 1.66, shot.position[2]);
    art.geometry.computeBoundingBox();
    const artLocal = art.geometry.boundingBox;
    const raycaster = new THREE.Raycaster();
    const blockedCore = [];
    for (const fy of [-0.3, 0, 0.3]) {
      for (const fx of [-0.3, 0, 0.3]) {
        const point = new THREE.Vector3(
          THREE.MathUtils.lerp(artLocal.min.x, artLocal.max.x, fx + 0.5),
          THREE.MathUtils.lerp(artLocal.min.y, artLocal.max.y, fy + 0.5),
          0,
        ).applyMatrix4(art.matrixWorld);
        const direction = point.clone().sub(eye);
        const distance = direction.length();
        raycaster.set(eye, direction.normalize());
        raycaster.far = distance + 0.08;
        const first = raycaster.intersectObjects(sightlineMeshes, false)
          .find(({ object }) => shown(object) && opaque(object));
        if (first?.object !== art) blockedCore.push({
          fx,
          fy,
          name: first?.object?.name || '(no opaque hit)',
          parent: first?.object?.parent?.name || '(unnamed parent)',
          distance: first ? Number(first.distance.toFixed(4)) : null,
        });
      }
    }
    return {
      slot: shot.slot,
      mountKind,
      wall: wall.mesh.name || '(unnamed finish)',
      signedRearGap: Number(signedRearGap.toFixed(4)),
      separation: Number(Math.max(0, signedRearGap).toFixed(4)),
      cameraDot: Number(normal.dot(eye.clone().sub(centre).normalize()).toFixed(4)),
      occluders,
      blockedCore,
    };
  });
  const failures = rows.filter((row) => row.mountKind === 'missing'
    || row.signedRearGap < -0.005 || row.signedRearGap > 0.005 || row.cameraDot <= 0
    || row.occluders.length > 0 || row.blockedCore.length > 0);
  if (process.env.MANSION_MOUNT_AUDIT_REPORT === '1') {
    console.log(`MANSION_MOUNT_AUDIT ${JSON.stringify(rows)}`);
  }
  assert.deepEqual(failures, [], `owner-picture mount audit:\n${JSON.stringify(rows, null, 2)}`);
});

test("Lou's boss-shirt photograph has a fully clear readable face from the office floor", () => {
  const dressedInterior = buildMansionInterior({ grounds });
  assert.deepEqual(
    dressedInterior.applyResolvedArt(resolvedArt('mansion.office.boss', 1005 / 1200)),
    ['mansion.office.boss'],
  );
  dressedInterior.root.updateMatrixWorld(true);

  const picture = dressedInterior.props.office.boss.art;
  picture.geometry.computeBoundingBox();
  const local = picture.geometry.boundingBox;
  const centre = new THREE.Box3().setFromObject(picture).getCenter(new THREE.Vector3());
  const eye = new THREE.Vector3(centre.x, 7.66, 66.6);
  const raycaster = new THREE.Raycaster();
  const sightlineMeshes = [];
  dressedInterior.root.traverse((object) => {
    if (object.isMesh && !object.isSkinnedMesh && object.geometry && object.material) {
      sightlineMeshes.push(object);
    }
  });
  const shown = (object) => {
    for (let node = object; node; node = node.parent) {
      if (node.visible === false) return false;
    }
    return true;
  };
  const opaque = (object) => {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    return materials.some((material) => material?.visible !== false
      && (!material.transparent || (material.opacity ?? 1) >= 0.5));
  };
  const blockers = [];
  for (const fy of [-0.45, -0.225, 0, 0.225, 0.45]) {
    for (const fx of [-0.45, -0.225, 0, 0.225, 0.45]) {
      const point = new THREE.Vector3(
        THREE.MathUtils.lerp(local.min.x, local.max.x, fx + 0.5),
        THREE.MathUtils.lerp(local.min.y, local.max.y, fy + 0.5),
        0,
      ).applyMatrix4(picture.matrixWorld);
      const direction = point.clone().sub(eye);
      const distance = direction.length();
      raycaster.set(eye, direction.normalize());
      raycaster.far = distance + 0.08;
      const hit = raycaster.intersectObjects(sightlineMeshes, false)
        .find(({ object }) => shown(object) && opaque(object));
      if (hit?.object !== picture) blockers.push({
        fx, fy,
        name: hit?.object?.name || '(unnamed mesh)',
        parent: hit?.object?.parent?.name || '(unnamed parent)',
      });
    }
  }

  assert.deepEqual(blockers, [],
    `office furniture still covers the real boss-shirt photograph: ${JSON.stringify(blockers)}`);
});

test('the Prospect wall object reads as a hung work jacket and his boots are human scale', () => {
  const [footlocker, jacket, boots] = interior.props.guestRoom.identity.belongings;
  assert.equal(footlocker.name, 'prospect-footlocker');
  assert.equal(jacket.name, 'prospect-work-jacket');
  assert.equal(boots.name, 'prospect-work-boots');
  const body = jacket.getObjectByName('prospect-jacket-body');
  const sleeves = descendantsNamed(jacket, 'prospect-jacket-sleeve');
  assert.ok(body && sleeves.length === 2, 'the wall object still lacks a recognizable jacket body and sleeves');
  for (const part of ['prospect-jacket-collar', 'prospect-jacket-lapel', 'prospect-jacket-hanger', 'prospect-jacket-hook']) {
    assert.ok(jacket.getObjectByName(part), `the Prospect jacket is missing ${part}`);
  }
  const bodyBox = new THREE.Box3().setFromObject(body);
  for (const sleeve of sleeves) {
    assert.ok(new THREE.Box3().setFromObject(sleeve).intersectsBox(bodyBox),
      'a Prospect jacket sleeve floats clear of its body');
  }
  const jacketBox = new THREE.Box3().setFromObject(jacket);
  assert.ok(interior.rooms.guestRoom.rect.x1 - jacketBox.max.x <= 0.06,
    'the jacket hanger floats away from the wall');

  const bootBox = new THREE.Box3().setFromObject(boots);
  const bootSize = bootBox.getSize(new THREE.Vector3());
  assert.ok(bootSize.x <= 0.45 && bootSize.y <= 0.3 && bootSize.z <= 0.55,
    `the Prospect boots are still oversized (${bootSize.x.toFixed(2)} x ${bootSize.y.toFixed(2)} x ${bootSize.z.toFixed(2)} m)`);
  assert.ok(Math.abs(bootBox.min.y - interior.rooms.guestRoom.floor) <= 0.01,
    'the Prospect boots do not rest on the floor');
});
