import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

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
  const intersectingWhiteTrim = [];
  const whiteRailClearances = [];
  dressedInterior.root.traverse((object) => {
    if (!object.isMesh || object.isInstancedMesh || object === picture || !object.visible) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (!materials.some((material) => material?.color?.getHex() === 0xf0e9d8)) return;
    const trimBox = new THREE.Box3().setFromObject(object);
    if (trimBox.intersectsBox(pictureBox)) {
      intersectingWhiteTrim.push({
        name: object.name || '(unnamed white trim)',
        minY: trimBox.min.y,
        maxY: trimBox.max.y,
      });
    }
    const trimSize = trimBox.getSize(new THREE.Vector3());
    const sharesWallRun = trimBox.max.x >= pictureBox.min.x && trimBox.min.x <= pictureBox.max.x
      && trimBox.max.z >= pictureBox.min.z - 0.01 && trimBox.min.z <= pictureBox.max.z + 0.01;
    if (sharesWallRun && trimSize.y <= 0.12 && trimBox.max.y <= pictureBox.min.y) {
      whiteRailClearances.push(pictureBox.min.y - trimBox.max.y);
    }
  });

  assert.deepEqual(
    intersectingWhiteTrim,
    [],
    `white cellar trim still cuts through Casa Bonita: ${JSON.stringify(intersectingWhiteTrim)}`,
  );
  assert.ok(whiteRailClearances.length > 0, 'the Casa Bonita check did not resolve the actual white cellar rail');
  assert.ok(Math.min(...whiteRailClearances) >= 0.04,
    `Casa Bonita has only ${Math.min(...whiteRailClearances).toFixed(3)} m above the white cellar rail`);
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
