import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const [
  { buildCartelPalace },
  { buildMansionGrounds },
  { buildMansionInterior },
  { buildNoWakeWorld },
  { buildRoom },
  { EnolaSquatch },
] = await Promise.all([
  import('../src/cartel-palace/world.js'),
  import('../src/mansion/scenes/MansionGrounds.js'),
  import('../src/mansion/scenes/MansionInterior.js'),
  import('../src/nowake/world.js'),
  import('../src/silver/room.js'),
  import('../src/enolasquatch/scenes/EnolaSquatch.js'),
]);

function meshesNamed(root, name) {
  const meshes = [];
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (object.isMesh && object.name === name) meshes.push(object);
  });
  return meshes;
}

function boundsOf(object) {
  return new THREE.Box3().setFromObject(object);
}

function positiveFootprintOverlap(a, b, epsilon = 1e-4) {
  return Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x) > epsilon
    && Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z) > epsilon;
}

function positiveVolumeOverlap(a, b, epsilon = 1e-4) {
  return positiveFootprintOverlap(a, b, epsilon)
    && Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y) > epsilon;
}

test('every Silver produce crate rests on the floor or another crate', () => {
  const scene = new THREE.Scene();
  const previousWindow = globalThis.window;
  globalThis.window ??= {};
  try {
    buildRoom(scene);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
  const crates = meshesNamed(scene, 'produce-crate');
  assert.equal(crates.length, 6);

  const boxes = crates.map(boundsOf);
  const floorBoxes = [];
  scene.traverse((object) => {
    if (!object.isMesh || object.geometry?.type !== 'PlaneGeometry') return;
    const box = boundsOf(object);
    if (Math.abs(box.min.y) <= 1e-4 && Math.abs(box.max.y) <= 1e-4) floorBoxes.push(box);
  });
  for (let index = 0; index < boxes.length; index++) {
    const item = boxes[index];
    const floorSupported = floorBoxes.some((floor) => positiveFootprintOverlap(item, floor)
      && Math.abs(item.min.y - floor.max.y) <= 1e-4);
    const crateSupported = boxes.some((support, supportIndex) => supportIndex !== index
      && positiveFootprintOverlap(item, support)
      && Math.abs(item.min.y - support.max.y) <= 1e-4);
    assert.ok(
      floorSupported || crateSupported,
      `produce crate ${index} floats ${item.min.y.toFixed(3)} m above the floor without a crate beneath it`,
    );
  }
});

test('every Silver east-wall banquette has visible floor-to-seat support', () => {
  const scene = new THREE.Scene();
  const previousWindow = globalThis.window;
  globalThis.window ??= {};
  try {
    buildRoom(scene);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }

  const bases = meshesNamed(scene, 'east-banquette-seat-base');
  const plinths = meshesNamed(scene, 'east-banquette-plinth');
  assert.equal(bases.length, 5, 'east-wall banquette base count drifted');
  assert.equal(plinths.length, 5, 'each east-wall banquette needs one visible plinth');

  const floorBoxes = [];
  scene.traverse((object) => {
    if (!object.isMesh || object.geometry?.type !== 'PlaneGeometry') return;
    const box = boundsOf(object);
    if (Math.abs(box.min.y) <= 1e-4 && Math.abs(box.max.y) <= 1e-4) floorBoxes.push(box);
  });

  const baseBoxes = bases.map(boundsOf);
  for (const [index, plinth] of plinths.map(boundsOf).entries()) {
    const base = baseBoxes[index];
    assert.ok(
      floorBoxes.some((floor) => positiveFootprintOverlap(plinth, floor)
        && Math.abs(plinth.min.y - floor.max.y) <= 1e-4),
      `east banquette plinth ${index} does not meet the real dining-room floor`,
    );
    assert.ok(positiveFootprintOverlap(plinth, base), `east banquette plinth ${index} left its seat footprint`);
    assert.ok(
      Math.abs(plinth.max.y - base.min.y) <= 1e-4,
      `east banquette ${index} has a ${(base.min.y - plinth.max.y).toFixed(3)} m plinth-to-seat gap`,
    );
  }
});

test('every Silver dry-store shelf is carried by four visible floor-standing uprights', () => {
  const scene = new THREE.Scene();
  const previousWindow = globalThis.window;
  globalThis.window ??= {};
  try {
    buildRoom(scene);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
  scene.updateMatrixWorld(true);

  const racks = [];
  scene.traverse((object) => {
    if (object.name === 'shelving') racks.push(object);
  });
  assert.equal(racks.length, 3, 'dry-store rack count drifted');

  const floorBoxes = [];
  scene.traverse((object) => {
    if (!object.isMesh || object.geometry?.type !== 'PlaneGeometry') return;
    const box = boundsOf(object);
    if (Math.abs(box.min.y + 2.9) <= 1e-4 && Math.abs(box.max.y + 2.9) <= 1e-4) floorBoxes.push(box);
  });
  assert.ok(floorBoxes.length > 0, 'the real cellar floor was not built');

  for (const [rackIndex, rack] of racks.entries()) {
    const boards = rack.children.filter((child) => child.name === 'dry-store-shelf-board');
    const uprights = rack.children.filter((child) => child.name === 'dry-store-shelf-upright');
    assert.equal(boards.length, 5, `dry-store rack ${rackIndex} shelf count drifted`);
    assert.equal(uprights.length, 4, `dry-store rack ${rackIndex} needs four uprights`);

    const uprightBoxes = uprights.map(boundsOf);
    for (const [uprightIndex, upright] of uprightBoxes.entries()) {
      assert.ok(
        floorBoxes.some((floor) => positiveFootprintOverlap(upright, floor)
          && Math.abs(upright.min.y - floor.max.y) <= 1e-4),
        `dry-store rack ${rackIndex} upright ${uprightIndex} does not meet the cellar floor`,
      );
    }
    for (const [boardIndex, board] of boards.map(boundsOf).entries()) {
      const joined = uprightBoxes.filter((upright) => positiveVolumeOverlap(board, upright));
      assert.equal(joined.length, 4, `dry-store rack ${rackIndex} shelf ${boardIndex} is not joined to all four uprights`);
    }
  }
});

test('every Cartel dining place setting is seated on the table', () => {
  const scene = new THREE.Scene();
  buildCartelPalace(scene);
  const tableTop = meshesNamed(scene, 'mark-dining-table.top');
  assert.equal(tableTop.length, 1);
  const supportY = boundsOf(tableTop[0]).max.y;

  const runners = meshesNamed(scene, 'dining-table-runner');
  assert.equal(runners.length, 1);
  const runnerBox = boundsOf(runners[0]);
  assert.ok(Math.abs(runnerBox.min.y - supportY) <= 1e-4,
    `dining table runner has a ${(runnerBox.min.y - supportY).toFixed(3)} m table-support gap`);

  const candles = meshesNamed(scene, 'dining-candle');
  assert.equal(candles.length, 7);
  for (const [index, candle] of candles.entries()) {
    const gap = boundsOf(candle).min.y - runnerBox.max.y;
    assert.ok(Math.abs(gap) <= 1e-4, `dining candle ${index} has a ${gap.toFixed(3)} m runner gap`);
  }

  for (const [name, count] of [
    ['dining-plate', 8],
    ['dining-glass', 8],
    ['dining-napkin', 8],
  ]) {
    const objects = meshesNamed(scene, name);
    assert.equal(objects.length, count, `${name} count drifted`);
    for (const [index, object] of objects.entries()) {
      const gap = boundsOf(object).min.y - supportY;
      assert.ok(
        Math.abs(gap) <= 1e-4,
        `${name} ${index} has a ${gap.toFixed(3)} m table-support gap`,
      );
    }
  }

  const rims = meshesNamed(scene, 'dining-plate-rim');
  assert.equal(rims.length, 8);
  for (const [index, rim] of rims.entries()) {
    const plate = rim.parent.children.find((child) => child.name === 'dining-plate');
    assert.ok(plate, `dining plate ${index} lost its rim support`);
    const gap = boundsOf(rim).min.y - boundsOf(plate).max.y;
    assert.ok(Math.abs(gap) <= 1e-4, `dining plate rim ${index} has a ${gap.toFixed(3)} m plate gap`);
  }
});

test('every Mansion living-room couch base is visibly supported by four feet', () => {
  const grounds = buildMansionGrounds(null);
  const interior = buildMansionInterior({ grounds });
  const bases = meshesNamed(interior.root, 'couch-base');
  const feet = meshesNamed(interior.root, 'couch-foot');
  const livingFloor = meshesNamed(interior.root, 'living-floor');
  assert.equal(bases.length, 3);
  assert.equal(feet.length, 12);
  assert.equal(livingFloor.length, 1);

  const floorY = boundsOf(livingFloor[0]).max.y;
  const footBoxes = feet.map(boundsOf);
  for (const [footIndex, foot] of footBoxes.entries()) {
    assert.ok(
      Math.abs(foot.min.y - floorY) <= 1e-4,
      `living couch foot ${footIndex} has a ${(foot.min.y - floorY).toFixed(3)} m floor gap`,
    );
  }

  for (const [baseIndex, base] of bases.map(boundsOf).entries()) {
    const supporters = footBoxes.filter((foot) => positiveFootprintOverlap(base, foot)
      && Math.abs(base.min.y - foot.max.y) <= 1e-4);
    assert.equal(supporters.length, 4, `living couch base ${baseIndex} does not have four joined feet`);
  }
});

test('every NO WAKE neighboring-boat cleat is seated on its visible deck', () => {
  const scene = new THREE.Scene();
  buildNoWakeWorld(scene);
  const cleats = [];
  scene.traverse((object) => {
    if (object.isMesh && /^neighbor cleat (?:port|starboard) [12]$/.test(object.name)) cleats.push(object);
  });
  assert.equal(cleats.length, 8);

  for (const [index, cleat] of cleats.entries()) {
    const deck = cleat.parent.children.find((child) => child.name === 'neighbor deck sole');
    assert.ok(deck, `neighbor cleat ${index} lost its deck`);
    const cleatBox = boundsOf(cleat);
    const deckBox = boundsOf(deck);
    assert.ok(positiveFootprintOverlap(cleatBox, deckBox), `neighbor cleat ${index} left the deck footprint`);
    const gap = cleatBox.min.y - deckBox.max.y;
    assert.ok(Math.abs(gap) <= 1e-4, `neighbor cleat ${index} has a ${gap.toFixed(4)} m deck gap`);
  }
});

test('every Enola cockpit seat has four visible floor-to-pan legs', () => {
  const aircraft = new EnolaSquatch();
  aircraft.group.updateMatrixWorld(true);
  const cabinFloors = meshesNamed(aircraft.group, 'cabin-floor').map(boundsOf);
  const cabinWalkways = meshesNamed(aircraft.group, 'cabin-walkway').map(boundsOf);
  assert.equal(cabinFloors.length, 1);
  assert.equal(cabinWalkways.length, 1);

  for (const role of ['pilot', 'copilot', 'navigator']) {
    const seat = aircraft.anchors.seats[role];
    assert.ok(seat, `${role} seat anchor is missing`);
    const pan = seat.children.find((child) => child.name === 'cockpit-seat-pan');
    const legs = seat.children.filter((child) => child.name === 'cockpit-seat-leg');
    assert.ok(pan, `${role} seat lost its named pan`);
    assert.equal(legs.length, 4, `${role} seat needs four visible legs`);

    const panBox = boundsOf(pan);
    for (const [index, leg] of legs.entries()) {
      const legBox = boundsOf(leg);
      assert.ok(positiveFootprintOverlap(legBox, panBox), `${role} leg ${index} left the pan footprint`);
      assert.ok(
        Math.abs(legBox.max.y - panBox.min.y) <= 1e-4,
        `${role} leg ${index} has a ${(panBox.min.y - legBox.max.y).toFixed(3)} m pan gap`,
      );
      assert.ok(
        cabinFloors.some((floor) => positiveFootprintOverlap(legBox, floor)
          && Math.abs(legBox.min.y - floor.max.y) <= 1e-4),
        `${role} leg ${index} does not meet the real cabin floor`,
      );
      assert.ok(
        cabinWalkways.every((walkway) => !positiveVolumeOverlap(legBox, walkway)),
        `${role} leg ${index} penetrates the raised cabin walkway`,
      );
    }
  }
});
