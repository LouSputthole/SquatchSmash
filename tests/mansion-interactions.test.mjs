import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import * as THREE from 'three';

import { PEE_CUE_NAMES, PeeSystem } from '../src/core/pee-system.js';
import { FocusRush } from '../src/core/focus-rush.js';
import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const {
  buildMansionGrounds, GROUND_Y, POOL, UPPER_Y, VAULT,
} = await import('../src/mansion/scenes/MansionGrounds.js');
const {
  buildMansionInterior, LOUNGE, MANSION_ART_SLOTS, STAIR_EAST,
} = await import('../src/mansion/scenes/MansionInterior.js');
const { buildSilentSquatch } = await import('../src/mansion/scenes/SilentSquatch.js');
const {
  mountMansionCast, theatreSeatAvailable, theatreSeatOccupant,
} = await import('../src/mansion/cast.js');
const {
  BONG_OBJECT_NAMES, createBongBehavior, registerInteractiveBong,
} = await import('../src/world/bong.js');
const { BLOOD_MARK_NAME, BLOOD_POOL_NAME } = await import('../src/world/blood.js');
const mansionMainSource = readFileSync(new URL('../src/mansion/main.js', import.meta.url), 'utf8');
const apartmentMainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const apartmentSource = readFileSync(new URL('../src/world/apartment.js', import.meta.url), 'utf8');
const bingMainSource = readFileSync(new URL('../src/bing/main.js', import.meta.url), 'utf8');
const mansionVerifierSource = readFileSync(new URL('../tools/verify-mansion.mjs', import.meta.url), 'utf8');
const artManifest = JSON.parse(readFileSync(new URL('../assets/art/manifest.json', import.meta.url), 'utf8'));

test('all ten owner-authored Mansion photographs are recovered and hung in their original rooms', () => {
  const expected = new Map([
    ['mansion.gallery.roster', 'austin-major-2025-roster.jpg'],
    ['mansion.ballroom.major', 'austin-major-cowboy-banner.jpg'],
    ['mansion.lounge.cowboy', 'austin-major-cowboy.jpg'],
    ['mansion.conference.stacks', 'logo-5-years-of-stacks.jpg'],
    ['mansion.office.boss', 'boss-camp-shirt.jpg'],
    ['mansion.winter.almighty', 'squatch-almighty.jpg'],
    ['mansion.cellar.bus', 'party-bus-night.jpg'],
    ['mansion.guest.dog', 'house-dog.jpg'],
    ['mansion.theatre.lockup', 'austin-major-lockup.jpg'],
    ['mansion.lan.denver', 'logo-denver-2026.jpg'],
  ]);
  const grounds = buildMansionGrounds(null);
  const interior = buildMansionInterior({ grounds });
  const pieces = new Map(interior.art.map((piece) => [piece.id, piece]));

  assert.equal(expected.size, 10);
  for (const [slot, file] of expected) {
    assert.ok(MANSION_ART_SLOTS.includes(slot), `${slot} is absent from the Mansion art contract`);
    assert.equal(artManifest.art.find((entry) => entry.slot === slot)?.file, file);
    assert.equal(existsSync(new URL(`../assets/art/${file}`, import.meta.url)), true, `${file} is missing`);
    assert.ok(pieces.has(slot), `${slot} has no physical picture in the built Mansion`);
    assert.equal(interior.art.filter((piece) => piece.id === slot).length, 1,
      `${slot} is duplicated outside its one authored room`);
  }
  assert.equal(new Set(expected.values()).size, 10, 'one recovered image was reused in place of another');
});

test('the Flamingo-Mega gallery roster and paired lamp hang beside the east stair, never over it', () => {
  const grounds = buildMansionGrounds(null);
  const interior = buildMansionInterior({ grounds });
  interior.root.updateMatrixWorld(true);

  const roster = interior.props.gallery.roster;
  const rosterBox = new THREE.Box3().setFromObject(roster);
  assert.ok(rosterBox.min.x > STAIR_EAST.x1 + 0.2,
    `the gallery roster spans x ${rosterBox.min.x.toFixed(3)}..${rosterBox.max.x.toFixed(3)} `
    + `over the east stair ending at x ${STAIR_EAST.x1.toFixed(3)}`);

  const pairedLamp = interior.lights.find((light) => (
    Math.abs(light.position.x - roster.position.x) < 0.25
    && Math.abs(light.position.z - roster.position.z) < 0.4
    && light.position.y > roster.position.y + 0.7
  ));
  assert.ok(pairedLamp, 'the gallery roster lost its paired picture lamp');
  assert.ok(pairedLamp.position.x > STAIR_EAST.x1 + 0.2,
    `the gallery roster lamp still hangs over the east stair at x ${pairedLamp.position.x.toFixed(3)}`);
});

test('the framed Austin portrait and its sconce contact the billiard-room wall', () => {
  const grounds = buildMansionGrounds(null);
  const interior = buildMansionInterior({ grounds });
  interior.root.updateMatrixWorld(true);

  const cowboy = new THREE.Box3().setFromObject(interior.props.lounge.cowboy.group);
  const pictureGap = cowboy.min.x - LOUNGE.x0;
  assert.ok(pictureGap >= -0.015 && pictureGap <= 0.015,
    `the Austin frame is ${pictureGap.toFixed(4)} m from the billiard-room wall`);

  const backplates = interior.root.getObjectByName('sconce-backplate');
  assert.ok(backplates?.isInstancedMesh, 'the shared sconce backplate batch is missing');
  backplates.geometry.computeBoundingBox();
  const localBox = backplates.geometry.boundingBox;
  const instance = new THREE.Matrix4();
  const world = new THREE.Matrix4();
  let pairedPlate = null;
  for (let index = 0; index < backplates.count; index += 1) {
    backplates.getMatrixAt(index, instance);
    world.multiplyMatrices(backplates.matrixWorld, instance);
    const box = localBox.clone().applyMatrix4(world);
    const centre = box.getCenter(new THREE.Vector3());
    if (Math.abs(centre.z - 40) < 0.05 && Math.abs(centre.y - (1.2 + 3.25)) < 0.05) {
      pairedPlate = box;
      break;
    }
  }
  assert.ok(pairedPlate, 'the Austin portrait lost its paired billiard-room sconce');
  const plateGap = pairedPlate.min.x - LOUNGE.x0;
  assert.ok(plateGap >= -0.015 && plateGap <= 0.015,
    `the Austin sconce backplate is ${plateGap.toFixed(4)} m from the wall`);
});

test('the bedroom pass makes the lower room the Prospect\'s and gives every bed its authored art', () => {
  const grounds = buildMansionGrounds(null);
  const interior = buildMansionInterior({ grounds });
  const prospect = interior.props.guestRoom;

  assert.deepEqual(prospect.identity?.owners, ['prospect']);
  assert.equal(prospect.identity?.sign?.name, 'prospect-room-sign');
  assert.ok(prospect.identity.depth >= 6.8, `Prospect room is only ${prospect.identity?.depth ?? 0} m deep`);
  assert.ok(prospect.bed.position.z > prospect.identity.entryZ + prospect.identity.depth * 0.65,
    'the bed is still sitting in the front half of the basement room');
  assert.deepEqual(
    prospect.identity?.belongings?.map((piece) => piece.name),
    ['prospect-footlocker', 'prospect-work-jacket', 'prospect-work-boots'],
    'the Prospect room still reads as a generic guest room instead of an occupied basement bedroom',
  );

  const bedrooms = interior.props.bedrooms;
  assert.equal(Object.keys(bedrooms).length, 4);
  for (const [id, room] of Object.entries(bedrooms)) {
    assert.ok(room.bed?.isObject3D, `${id} has no published bed`);
    assert.ok(room.art?.isObject3D, `${id} has no bed art`);
    assert.ok(room.screen?.isObject3D, `${id} has no television`);
  }
  assert.equal(bedrooms.westRear.art.name, 'lake-room-bed-art');
  assert.equal(bedrooms.westRear.art.userData.theme, 'lake');
  assert.equal(bedrooms.eastRear.identity?.accentPortraits?.length, 2,
    'Booski and DeathMegatron only have the original pair of portraits');
  assert.deepEqual(
    bedrooms.westFront.details?.map((piece) => piece.name),
    ['gothic-open-folio-left', 'gothic-open-folio-right', 'gothic-folio-ribbon'],
    'the gothic front bedroom did not receive its lived-in detail pass',
  );
  assert.deepEqual(
    bedrooms.eastFront.details?.map((piece) => piece.name),
    ['oldtime-trunk-strap-left', 'oldtime-trunk-strap-right', 'oldtime-travel-tag'],
    'the old-timey front bedroom did not receive its travel detail pass',
  );
});

test('the kitchen sink has two recessed open bowls and the running water lands inside a bowl', () => {
  const grounds = buildMansionGrounds(null);
  const interior = buildMansionInterior({ grounds });
  const sink = interior.props.kitchen.sink;
  interior.root.updateMatrixWorld(true);

  assert.ok(sink, 'the kitchen does not publish its built sink');
  assert.equal(sink.bowls?.length, 2, 'the sink is not a real double bowl');
  assert.ok(sink.rim?.isObject3D, 'the sink has no open rim');
  assert.ok(sink.stream?.isObject3D, 'the sink does not publish its running-water mesh');

  const rimBox = new THREE.Box3().setFromObject(sink.rim);
  const bowlBoxes = sink.bowls.map((bowl) => new THREE.Box3().setFromObject(bowl));
  for (const [index, bowlBox] of bowlBoxes.entries()) {
    const size = bowlBox.getSize(new THREE.Vector3());
    assert.ok([size.x, size.y, size.z].every((value) => Number.isFinite(value) && value > 0),
      `sink bowl ${index + 1} has collapsed or non-finite geometry`);
    assert.ok(bowlBox.max.y <= rimBox.max.y - 0.08,
      `sink bowl ${index + 1} is a solid slab instead of a recessed basin`);
  }

  const streamAt = sink.stream.getWorldPosition(new THREE.Vector3());
  const receivingBowls = bowlBoxes.filter((box) => streamAt.x > box.min.x && streamAt.x < box.max.x
    && streamAt.z > box.min.z && streamAt.z < box.max.z);
  assert.equal(receivingBowls.length, 1,
    'the tap stream lands on the centre divider instead of inside exactly one bowl');
});

test('Lou\'s third-floor room finishes the bed zone with a scene-built accent, not a duplicate recovered photo', () => {
  const grounds = buildMansionGrounds(null);
  const interior = buildMansionInterior({ grounds });
  const suite = interior.props.masterSuite;
  const finish = suite.refinement;
  interior.root.updateMatrixWorld(true);

  assert.ok(finish, 'Lou\'s suite has no published refinement pass');
  assert.equal(finish.bench?.name, 'suite-bed-bench');
  assert.equal(finish.runners?.length, 2, 'the canopy bed does not have two finished bedside runners');
  assert.equal(finish.portrait?.name, 'suite-lou-accent');
  assert.equal(finish.portraitArt?.userData?.artPiece, 'suite-lou-accent');
  assert.equal(finish.portraitArt?.userData?.artSlot, undefined,
    'the suite accent claims the recovered office photograph slot');
  assert.equal(finish.portraitArt?.userData?.art?.slot, undefined,
    'the suite accent was wired into the manifest art pipeline');

  const mattress = interior.root.getObjectByName('suite-bed-mattress');
  const mattressBox = new THREE.Box3().setFromObject(mattress);
  const benchBox = new THREE.Box3().setFromObject(finish.bench);
  assert.ok(benchBox.min.z >= mattressBox.max.z + 0.25,
    'the bed-end bench is pushed into the canopy bed');
  const benchCollider = interior.colliders.find((collider) => (
    collider.min.x <= benchBox.min.x && collider.max.x >= benchBox.max.x
    && collider.min.z <= benchBox.min.z && collider.max.z >= benchBox.max.z
    && collider.min.y <= benchBox.min.y + 0.02 && collider.max.y >= benchBox.max.y - 0.02
    && collider.max.x - collider.min.x <= benchBox.max.x - benchBox.min.x + 0.1
    && collider.max.z - collider.min.z <= benchBox.max.z - benchBox.min.z + 0.1
  ));
  assert.ok(benchCollider, 'the visible bed-end bench has no matching physical collider');

  for (const object of [finish.bench, ...finish.runners, finish.portrait]) {
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    assert.ok([size.x, size.y, size.z].every((value) => Number.isFinite(value) && value > 0),
      `${object.name} has collapsed or non-finite geometry`);
  }
});

test('Lou\'s bed-foot composition has paired accent light and a dedicated portrait light', () => {
  const grounds = buildMansionGrounds(null);
  const interior = buildMansionInterior({ grounds });
  const finish = interior.props.masterSuite.refinement;
  interior.root.updateMatrixWorld(true);

  assert.deepEqual(
    finish.accentLights?.map((object) => object.name),
    ['suite-bed-foot-lamp-left', 'suite-bed-foot-lamp-right'],
    'the large bed-foot zone still relies on the distant suite ceiling lights',
  );
  assert.equal(finish.portraitLight?.name, 'suite-lou-accent-light',
    'the scene-built Lou accent is still unlit on the dark south wall');

  const lightGroups = [...finish.accentLights, finish.portraitLight];
  for (const object of lightGroups) {
    const bounds = new THREE.Box3().setFromObject(object);
    const size = bounds.getSize(new THREE.Vector3());
    let intensity = 0;
    object.traverse((piece) => { if (piece.isLight) intensity += piece.intensity; });
    assert.ok([size.x, size.y, size.z].every((value) => Number.isFinite(value) && value > 0),
      `${object.name} has collapsed or non-finite fixture geometry`);
    assert.ok(intensity >= 1.1, `${object.name} has no meaningful live light`);
  }
});

test('all five ordinary bedrooms publish a distinct named functional cluster', () => {
  const grounds = buildMansionGrounds(null);
  const interior = buildMansionInterior({ grounds });
  interior.root.updateMatrixWorld(true);

  const expected = [
    [interior.props.bedrooms.westFront, 'packing', 'gothic-packing-cluster', [
      'gothic-packing-case', 'gothic-packing-lid', 'gothic-packed-garment', 'gothic-valet-stand',
    ]],
    [interior.props.bedrooms.eastFront, 'washstand', 'oldtime-washstand-cluster', [
      'oldtime-washstand', 'oldtime-basin', 'oldtime-pitcher', 'oldtime-towel',
    ]],
    [interior.props.bedrooms.westRear, 'writing-desk', 'lake-writing-cluster', [
      'lake-writing-desk', 'lake-writing-chair', 'lake-desk-lamp', 'lake-desk-letter',
    ]],
    [interior.props.bedrooms.eastRear, 'dressing-bench', 'modern-dressing-cluster', [
      'modern-dressing-bench', 'modern-folded-garment', 'modern-dressing-mirror',
    ]],
    [interior.props.guestRoom, 'dressing-storage', 'prospect-dressing-cluster', [
      'guest-dresser', 'guest-mirror', 'guest-wardrobe',
    ]],
  ];

  for (const [room, kind, rootName, inventoryNames] of expected) {
    assert.equal(room.cluster?.kind, kind, `${rootName} does not publish its room-specific function`);
    assert.equal(room.cluster?.root?.name, rootName, `${rootName} is not a public built group`);
    assert.deepEqual(room.cluster?.inventory?.map((object) => object.name), inventoryNames,
      `${rootName} has anonymous or missing inventory`);
    for (const object of room.cluster.inventory) {
      const bounds = new THREE.Box3().setFromObject(object);
      const size = bounds.getSize(new THREE.Vector3());
      assert.ok([size.x, size.y, size.z].every((value) => Number.isFinite(value) && value > 0),
        `${object.name} has collapsed or non-finite geometry`);
    }
  }
});

test('the lake bedroom writing desk has the task light and letter its room promises', () => {
  const grounds = buildMansionGrounds(null);
  const interior = buildMansionInterior({ grounds });
  const room = interior.props.bedrooms.westRear;
  interior.root.updateMatrixWorld(true);

  assert.deepEqual(
    room.details?.map((object) => object.name),
    ['lake-desk-lamp', 'lake-desk-letter'],
    'the lake desk is still an empty slab with an anonymous paper on it',
  );
  for (const object of room.details) {
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    assert.ok([size.x, size.y, size.z].every((value) => Number.isFinite(value) && value > 0),
      `${object.name} has collapsed or non-finite geometry`);
    assert.ok(centre.x >= -16 && centre.x <= -9.15 && centre.z >= 53.15 && centre.z <= 65.85,
      `${object.name} is not in the lake bedroom`);
  }
});

test('the modern shared bedroom publishes its two personal finishing objects as room detail', () => {
  const grounds = buildMansionGrounds(null);
  const interior = buildMansionInterior({ grounds });
  const room = interior.props.bedrooms.eastRear;
  interior.root.updateMatrixWorld(true);

  assert.deepEqual(
    room.details?.map((object) => object.name),
    ['booski-death-room-ledger', 'booski-death-room-security-radio'],
    'the modern room still exposes only architecture instead of its residents\' finishing objects',
  );
  for (const object of room.details) {
    const bounds = new THREE.Box3().setFromObject(object);
    const size = bounds.getSize(new THREE.Vector3());
    assert.ok([size.x, size.y, size.z].every((value) => Number.isFinite(value) && value > 0),
      `${object.name} has collapsed or non-finite geometry`);
  }
});

test('the Prospect basement bedroom has layered bedding instead of the shared bare guest bed', () => {
  const grounds = buildMansionGrounds(null);
  const interior = buildMansionInterior({ grounds });
  const room = interior.props.guestRoom;
  interior.root.updateMatrixWorld(true);

  assert.deepEqual(
    room.refinement?.bedding?.map((object) => object.name),
    ['guest-bed-coverlet', 'guest-bed-throw', 'guest-bed-cushion-left', 'guest-bed-cushion-right'],
    'the Prospect room still uses the unlayered shared bed treatment',
  );
  for (const object of room.refinement.bedding) {
    const bounds = new THREE.Box3().setFromObject(object);
    const size = bounds.getSize(new THREE.Vector3());
    const centre = bounds.getCenter(new THREE.Vector3());
    assert.ok([size.x, size.y, size.z].every((value) => Number.isFinite(value) && value > 0),
      `${object.name} has collapsed or non-finite geometry`);
    assert.ok(centre.x >= -15.6 && centre.x <= -7.9 && centre.z >= 67.7 && centre.z <= 74.6,
      `${object.name} is outside the Prospect bedroom`);
  }
});

test('every ordinary Mansion bedroom rug renders above its finished floor instead of underneath it', () => {
  const grounds = buildMansionGrounds(null);
  const interior = buildMansionInterior({ grounds });
  interior.root.updateMatrixWorld(true);

  const rooms = [
    ['westFront', interior.props.bedrooms.westFront, 'bed-west-front-floor'],
    ['eastFront', interior.props.bedrooms.eastFront, 'bed-east-front-floor'],
    ['westRear', interior.props.bedrooms.westRear, 'bed-west-rear-floor'],
    ['eastRear', interior.props.bedrooms.eastRear, 'bed-east-rear-floor'],
    ['prospect', interior.props.guestRoom, 'guest-floor'],
  ];
  for (const [id, room, floorName] of rooms) {
    assert.ok(room.rug?.isMesh, `${id} does not publish its real room rug`);
    const floor = interior.root.getObjectByName(floorName);
    const floorBox = new THREE.Box3().setFromObject(floor);
    const rugBox = new THREE.Box3().setFromObject(room.rug);
    const size = rugBox.getSize(new THREE.Vector3());
    assert.ok(room.rug.position.y >= floorBox.max.y + 0.002,
      `${id} rug is buried ${Math.round((floorBox.max.y - room.rug.position.y) * 1000)} mm under its floor`);
    assert.ok(size.x >= 4.5 && size.z >= 4.0,
      `${id} rug does not establish a useful furniture zone: ${size.x.toFixed(2)} x ${size.z.toFixed(2)} m`);
  }
});

test('the vault picture is outside, the Great Includer base cannot flicker, and the fountain is clear', () => {
  const grounds = buildMansionGrounds(null);
  const interior = buildMansionInterior({ grounds });
  const mark = interior.props.vault.mark;

  assert.ok(mark.position.z < VAULT.z0, 'the vault picture is still inside the vault');
  assert.ok(Math.abs(Math.abs(mark.rotation.y) - Math.PI) < 0.001,
    'the exterior vault picture does not face the corridor');
  assert.equal(interior.props.trophyHall.engraving, 'THE GREAT INCLUDER');
  const daisTop = interior.props.trophyHall.dais.top;
  const plinth = interior.root.getObjectByName('includer-plinth');
  const foot = interior.root.getObjectByName('includer-plinth-foot');
  const cap = interior.root.getObjectByName('includer-plinth-cap');
  const plinthBox = new THREE.Box3().setFromObject(plinth);
  const footBox = new THREE.Box3().setFromObject(foot);
  const capBox = new THREE.Box3().setFromObject(cap);
  const plinthSize = plinthBox.getSize(new THREE.Vector3());
  assert.ok([plinthSize.x, plinthSize.y, plinthSize.z].every((value) => Number.isFinite(value) && value > 0),
    `the Great Includer plinth has invalid 3D bounds ${plinthSize.toArray().join(' x ')}`);
  assert.ok(plinthSize.z >= 1.89,
    `the Great Includer plinth lost its 1.9 m depth (found ${plinthSize.z})`);
  assert.ok(plinthBox.min.y < daisTop, 'the Great Includer plinth still shares the dais top plane');
  assert.ok(footBox.min.y > daisTop, 'the Great Includer foot still shares the dais top plane');
  assert.ok(capBox.min.y < plinthBox.max.y, 'the Great Includer cap still shares the plinth top plane');

  const fountain = interior.props.winterGarden.pool;
  const fountainBox = new THREE.Box2(
    new THREE.Vector2(fountain.x - fountain.r, fountain.z - fountain.r),
    new THREE.Vector2(fountain.x + fountain.r, fountain.z + fountain.r),
  );
  const plants = [];
  interior.root.traverse((object) => {
    if (!object.name?.toLowerCase().includes('plant')) return;
    const at = object.getWorldPosition(new THREE.Vector3());
    if (fountainBox.containsPoint(new THREE.Vector2(at.x, at.z))) plants.push(object);
  });
  assert.equal(plants.length, 0, 'a potted plant is still standing in the nature-room fountain');
});

test('the marble bust clears its wall trophy and the pool coping is lifted clear of the deck', () => {
  const silent = buildSilentSquatch();
  silent.root.updateMatrixWorld(true);
  const bustBox = new THREE.Box3().setFromObject(silent.lab.hiddenWall.bust);
  const trophies = [];
  silent.root.traverse((object) => { if (object.name === 'silent-trophy') trophies.push(object); });
  assert.equal(trophies.length, 2);
  const nearestTrophy = trophies
    .map((object) => new THREE.Box3().setFromObject(object))
    .sort((a, b) => b.max.x - a.max.x)[0];
  assert.ok(bustBox.min.x - nearestTrophy.max.x >= 0.1,
    `bust clears the wall trophy by only ${(bustBox.min.x - nearestTrophy.max.x).toFixed(3)} m`);

  const grounds = buildMansionGrounds(null);
  grounds.root.updateMatrixWorld(true);
  const coping = [];
  grounds.root.traverse((object) => { if (object.name === 'pool-gold-coping') coping.push(object); });
  assert.equal(coping.length, 5);
  for (const piece of coping) {
    const box = new THREE.Box3().setFromObject(piece);
    assert.ok(box.min.y >= GROUND_Y + 0.01,
      `pool coping bottom ${box.min.y.toFixed(3)} still overlaps the deck`);
  }
});

test('the pool publishes a walkable stair down to a real basin floor', () => {
  const grounds = buildMansionGrounds(null);
  const patio = grounds.props.poolPatio;
  const levels = patio.entrySteps?.levels ?? [];

  assert.ok(levels.length >= 6, 'the pool has no authored entry stair');
  assert.equal(levels[0].y, GROUND_Y, 'the first tread is not flush with the deck');
  assert.equal(levels.at(-1).y, POOL.y, 'the final tread does not land on the basin floor');
  for (let i = 1; i < levels.length; i++) {
    assert.ok(levels[i].z0 >= levels[i - 1].z1 - 0.001, 'pool treads overlap out of order');
    assert.ok(levels[i].y < levels[i - 1].y, 'the pool stair does not descend into the water');
  }

  const x = (patio.entrySteps.x0 + patio.entrySteps.x1) / 2;
  for (const level of levels) {
    const z = (level.z0 + level.z1) / 2;
    assert.equal(patio.groundAt(x, z), level.y, `no walking surface on tread at z=${z}`);
  }
  assert.equal(patio.groundAt(x, (POOL.z0 + POOL.z1) / 2), POOL.y);
  assert.equal(patio.groundAt(POOL.x1 + 1, (POOL.z0 + POOL.z1) / 2), null);

  const mouthZ = (patio.entrySteps.z0 + POOL.z0) / 2;
  const mouthBlockers = grounds.colliders.filter((collider) => collider.min.x < x + 0.3
    && collider.max.x > x - 0.3
    && collider.min.z < mouthZ + 0.15
    && collider.max.z > mouthZ - 0.15
    && collider.max.y > POOL.y + 0.2);
  assert.deepEqual(mouthBlockers, [], 'a pool-wall collider still seals the entry steps');

  const visualSteps = [];
  grounds.root.traverse((object) => {
    if (object.name === 'pool-entry-step') visualSteps.push(object);
  });
  assert.equal(visualSteps.length, levels.length);
  assert.match(mansionMainSource, /poolPatio\.groundAt\(x, z\)/);
});

test('the guest-room family photo moved to the dresser and the Squatch crest owns the bed wall', () => {
  const grounds = buildMansionGrounds(null);
  const interior = buildMansionInterior({ grounds });
  const guest = interior.props.guestRoom;
  interior.root.updateMatrixWorld(true);

  assert.ok(guest.art?.isMesh, 'the guest-room family photo is missing');
  assert.ok(guest.crest?.isMesh, 'the guest-room Squatch crest is missing');
  assert.equal(guest.dresser?.name, 'guest-dresser');
  assert.equal(guest.crest.name, 'mansion.guest.crest');

  const dresserAt = guest.dresser.getWorldPosition(new THREE.Vector3());
  const photoAt = guest.art.getWorldPosition(new THREE.Vector3());
  const crestAt = guest.crest.getWorldPosition(new THREE.Vector3());
  const headboard = interior.root.getObjectByName('guest-headboard');
  const headboardBox = new THREE.Box3().setFromObject(headboard);
  const headboardAt = headboardBox.getCenter(new THREE.Vector3());
  const mirrorBox = new THREE.Box3().setFromObject(interior.root.getObjectByName('guest-mirror'));
  const photoBox = new THREE.Box3().setFromObject(guest.art);
  const crestBox = new THREE.Box3().setFromObject(guest.crest);

  assert.ok(Math.abs(photoAt.z - dresserAt.z) < 1.55, 'family photo is not beside the dresser');
  assert.ok(Math.abs(photoAt.x - dresserAt.x) < 0.7, 'family photo stayed over the bed');
  assert.equal(photoBox.intersectsBox(mirrorBox), false, 'family photo intersects the dresser mirror');
  assert.ok(Math.abs(crestAt.x - headboardAt.x) < 0.05, 'crest is not centred over the bed');
  assert.ok(Math.abs(crestAt.z - headboardAt.z) < 0.25, 'crest is not on the bed wall');
  assert.ok(crestBox.min.y > headboardBox.max.y + 0.02, 'crest overlaps the guest headboard');
  assert.ok(MANSION_ART_SLOTS.includes('mansion.guest.crest'));
  assert.equal(
    artManifest.art.find((entry) => entry.slot === 'mansion.guest.crest')?.file,
    'logo-crest.png',
  );
});

test('the winter-garden birdcage bars terminate in a named bottom tray', () => {
  const grounds = buildMansionGrounds(null);
  const interior = buildMansionInterior({ grounds });
  const tray = interior.props.winterGarden.birdcage?.bottom;

  assert.ok(tray?.isMesh, 'the birdcage still has no bottom');
  assert.equal(tray.name, 'winter-birdcage-bottom');

  const trayBox = new THREE.Box3().setFromObject(tray);
  const bars = [];
  interior.root.traverse((object) => {
    if (object.name === 'winter-birdcage-bar') bars.push(object);
  });
  assert.equal(bars.length, 10);
  for (const bar of bars) {
    const barBox = new THREE.Box3().setFromObject(bar);
    assert.ok(
      Math.abs(barBox.min.y - trayBox.max.y) < 0.04,
      `birdcage bar starts ${Math.abs(barBox.min.y - trayBox.max.y).toFixed(3)} m above its tray`,
    );
  }
});

test('both gate medallions use the approved Squatch crest slot', () => {
  const grounds = buildMansionGrounds(null);
  const medallions = grounds.props.gate?.medallions ?? [];

  assert.equal(medallions.length, 2, 'the gate does not publish both medallions');
  for (const medallion of medallions) {
    assert.equal(medallion.name, 'mansion-gate-squatch-crest');
    assert.equal(medallion.userData.art?.slot, 'mansion.gate.crests');
  }
  assert.equal(
    artManifest.art.find((entry) => entry.slot === 'mansion.gate.crests')?.file,
    'logo-crest.png',
  );
  assert.match(mansionVerifierSource, /both gate medallions resolve to the approved Squatch crest art/);
});

test('the modern guest bedroom is physically named for Booski and DeathMegatron', () => {
  const grounds = buildMansionGrounds(null);
  const interior = buildMansionInterior({ grounds });
  const room = interior.props.bedrooms.eastRear;
  const identity = room.identity;

  assert.deepEqual(identity?.owners, ['booski', 'deathmegatron']);
  assert.equal(identity?.plaque?.name, 'booski-death-room-plaque');
  assert.equal(identity?.crest?.name, 'booski-death-room-crest');
  assert.deepEqual(
    identity?.portraits?.map((portrait) => portrait.name),
    ['booski-death-room-booski-portrait', 'booski-death-room-deathmegatron-portrait'],
  );
  assert.deepEqual(
    identity?.props?.map((prop) => prop.name),
    ['booski-death-room-ledger', 'booski-death-room-security-radio'],
  );

  const roomRect = interior.rooms.bedEastRear.rect;
  const published = [
    identity.plaque,
    identity.crest,
    ...identity.portraits,
    ...identity.props,
  ];
  interior.root.updateMatrixWorld(true);
  for (const object of published) {
    const at = object.getWorldPosition(new THREE.Vector3());
    assert.ok(at.x >= roomRect.x0 && at.x <= roomRect.x1, `${object.name} is outside the room in x`);
    assert.ok(at.z >= roomRect.z0 && at.z <= roomRect.z1, `${object.name} is outside the room in z`);
  }

  for (const [slot, file] of [
    ['mansion.bedroom.booski-death.crest', 'logo-crest.png'],
    ['mansion.bedroom.booski-death.booski', 'shrine-booski-podium.jpg'],
    ['mansion.bedroom.booski-death.deathmegatron', 'family-portrait-deathmegatron.webp'],
  ]) {
    assert.ok(MANSION_ART_SLOTS.includes(slot), `${slot} is not resolved by the mansion art pipeline`);
    assert.equal(artManifest.art.find((entry) => entry.slot === slot)?.file, file);
  }
  assert.match(mansionVerifierSource, /Booski and DeathMegatron share one physically named bedroom/);
});

test('the Bada Bing grey sedan is staged inside the gate and recognizes only the saved plate ending', () => {
  const grounds = buildMansionGrounds(null);
  const sedan = grounds.props.greySedan;

  assert.equal(sedan?.group?.name, 'bada-bing-grey-sedan');
  assert.equal(sedan.kind, 'sedan');
  assert.equal(sedan.paint.color.getHex(), 0x2e3038);
  assert.equal(sedan.storyThread, 'bada_bing_one');
  assert.ok(sedan.z > 0 && sedan.z < 12, 'the sedan is not staged just inside the gate');
  assert.ok(sedan.worldCollider.max.x < -4.8, 'the sedan blocks the gate lane');
  const landscapingClashes = [
    ...grounds.props.landscaping.beds,
    ...grounds.props.landscaping.hedges,
  ].filter((item) => sedan.worldCollider.min.x < item.x1
    && sedan.worldCollider.max.x > item.x0
    && sedan.worldCollider.min.z < item.z1
    && sedan.worldCollider.max.z > item.z0);
  assert.deepEqual(landscapingClashes, [], 'the sedan is parked through the front landscaping');
  const palmClashes = grounds.props.palmSpots.filter(([x, z]) => (
    x + 0.4 > sedan.worldCollider.min.x
    && x - 0.4 < sedan.worldCollider.max.x
    && z + 0.4 > sedan.worldCollider.min.z
    && z - 0.4 < sedan.worldCollider.max.z
  ));
  assert.deepEqual(palmClashes, [], 'the sedan is parked through a palm tree');
  const layby = grounds.root.getObjectByName('grey-sedan-gate-layby');
  assert.ok(layby?.isMesh, 'the gate sedan has no authored lay-by');
  const laybyBox = new THREE.Box3().setFromObject(layby);
  assert.ok(laybyBox.min.x <= sedan.worldCollider.min.x
    && laybyBox.max.x >= sedan.worldCollider.max.x
    && laybyBox.min.z <= sedan.worldCollider.min.z
    && laybyBox.max.z >= sedan.worldCollider.max.z,
  'the grey sedan does not fit inside its gate lay-by');

  assert.equal(sedan.recognized, false);
  assert.equal(sedan.setCampaignEnding('warned'), false);
  assert.equal(sedan.recognized, false);
  assert.equal(sedan.setCampaignEnding('plate'), true);
  assert.equal(sedan.recognized, true);
  assert.equal(sedan.sourceEnding, 'plate');

  assert.match(mansionMainSource,
    /state\?\.missions\?\.\[MISSION_IDS\.BADA_BING_ONE\]\?\.ending/);
  assert.match(mansionMainSource, /greySedan\.setCampaignEnding\(badaBingEnding\)/);
  assert.match(mansionVerifierSource, /the Bada Bing grey sedan is staged inside the gate/);
  assert.match(mansionVerifierSource, /the saved plate ending is the only grey-sedan recognition trigger/);
});

test('PeeSystem targets the selected upstairs toilet and emits until released', () => {
  const calls = [];
  const stream = {
    stats: { total: 0, onTarget: 0, onFloor: 0, onWall: 0 },
    setColliders: (value) => calls.push(['colliders', value]),
    setFloorHeight: (value) => calls.push(['floor', value]),
    setTarget: (...args) => calls.push(['target', ...args]),
    resetStats: () => calls.push(['reset']),
    emit: (...args) => calls.push(['emit', ...args]),
    update: (dt) => calls.push(['update', dt]),
  };
  const loops = new Map();
  const audio = {
    play: (name) => calls.push(['play', name]),
    startLoop: (name) => loops.set(name, true),
    stopLoop: (name) => loops.delete(name),
    setLoopVolume: () => {},
  };
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(12, 7.66, 70);
  camera.lookAt(12, 6.4, 69);

  const seatPivot = new THREE.Group();
  const lidPivot = new THREE.Group();
  const toilet = {
    id: 'east-ensuite',
    bowl: new THREE.Vector3(12.4, 6.4, 70.2),
    radius: 0.21,
    waterY: 6.31,
    floorY: 6,
    collider: { id: 'east-loo-box' },
    seatPivot,
    lidPivot,
  };
  const pee = new PeeSystem({ camera, stream, audio, bladder: 0.5 });

  assert.equal(pee.start(toilet), true);
  assert.equal(pee.active, true);
  assert.equal(pee.toiletId, 'east-ensuite');
  assert.equal(seatPivot.rotation.x, -1.78);
  assert.equal(lidPivot.rotation.x, -1.92);
  assert.ok(calls.some(([kind, floor]) => kind === 'floor' && floor === 6));
  assert.ok(calls.some(([kind, bowl, radius, waterY, collider]) => kind === 'target'
    && bowl === toilet.bowl && radius === 0.21 && waterY === 6.31 && collider === toilet.collider));

  pee.update(0.25);
  assert.ok(calls.some(([kind]) => kind === 'emit'));
  assert.ok(pee.bladder < 0.5);

  assert.equal(pee.stop(), true);
  assert.equal(pee.active, false);
  assert.equal(seatPivot.rotation.x, 0);
  assert.equal(lidPivot.rotation.x, 0);
  assert.equal(loops.size, 0);
});

test('every Mansion toilet is published and bound to the shared hold-to-pee interaction', () => {
  const grounds = buildMansionGrounds(null);
  const interior = buildMansionInterior({ grounds });
  const toilets = Object.values(interior.props.bathrooms).map((bathroom) => bathroom.toilet);

  assert.equal(toilets.length, 2);
  assert.deepEqual(toilets.map(({ id }) => id).sort(), ['bath-east', 'bath-west']);
  for (const toilet of toilets) {
    assert.ok(toilet.group);
    assert.ok(toilet.collider?.isBox3);
    assert.equal(toilet.floorY, UPPER_Y);
    assert.ok(toilet.bowl.y > UPPER_Y);
    assert.ok(toilet.waterY > UPPER_Y);
    assert.ok(toilet.radius > 0.18);
  }

  assert.match(mansionMainSource, /new PeeSystem\(\{[\s\S]*colliders/);
  assert.match(mansionMainSource, /Object\.values\(interior\.props\.bathrooms\)/);
  assert.match(mansionMainSource, /onHoldProgress:[\s\S]*mansionPee\.start/);
  assert.match(mansionMainSource, /onTap:[\s\S]*mansionPee\.stop/);
  assert.deepEqual(PEE_CUE_NAMES, ['toilet.lid', 'pee.zip', 'pee.stream', 'pee.miss']);
  assert.match(mansionMainSource, /import \{ PEE_CUE_NAMES, PeeSystem \} from '\.\.\/core\/pee-system\.js'/);
  assert.match(mansionMainSource, /names: \[[\s\S]*\.\.\.weaponCueNames\(\),[\s\S]*\.\.\.PEE_CUE_NAMES/);
});

test('the shared Bing focus rush narrows the view and boosts movement for twenty-five seconds', () => {
  const camera = new THREE.PerspectiveCamera(68);
  const player = { moveScale: 1 };
  const rush = new FocusRush({ baseFov: 68 });

  assert.equal(rush.start(), 25);
  rush.update(0.5);
  rush.apply(camera, player);
  assert.ok(rush.strength > 0);
  assert.ok(camera.fov < 68);
  assert.ok(player.moveScale > 1);

  for (let i = 0; i < 700; i++) rush.update(0.05);
  rush.apply(camera, player);
  assert.equal(rush.remaining, 0);
  assert.ok(rush.strength < 0.001);
  assert.ok(Math.abs(camera.fov - 68) < 0.01);
  assert.ok(Math.abs(player.moveScale - 1) < 0.001);

  assert.match(bingMainSource, /import \{ FocusRush \} from '\.\.\/core\/focus-rush\.js'/);
  assert.match(bingMainSource, /const focusRush = new FocusRush\(\{ baseFov: 70 \}\)/);
  assert.match(bingMainSource, /focusRush\.start\(secs\)/);
  assert.match(bingMainSource,
    /focusRush\.apply\(camera, player, \{ baseMoveScale: player\.moveScale \}\)/);
  assert.match(bingMainSource, /drunk\.vignette \+ 0\.42 \* focusRush\.strength/);
  assert.doesNotMatch(bingMainSource, /const FOCUS_FOV|let focusK/);
});

test('Lou suite publishes one visible cocaine line that consumes into the shared Bing rush', () => {
  const grounds = buildMansionGrounds(null);
  const interior = buildMansionInterior({ grounds });
  const powder = interior.props.masterSuite.powder;

  assert.equal(powder.group.name, 'suite-cocaine');
  assert.equal(powder.line.name, 'suite-cocaine-line');
  assert.equal(powder.card.name, 'suite-cocaine-card');
  assert.equal(powder.line.visible, true);
  assert.equal(powder.consume(), true);
  assert.equal(powder.line.visible, false);
  assert.equal(powder.consume(), false);

  assert.match(mansionMainSource, /interaction\.register\(suitePowder\.group/);
  assert.match(mansionMainSource, /suiteFocus\.start\(25\)/);
  assert.match(mansionMainSource, /audio\.play\('bing\.line\.snort'/);
  assert.match(mansionMainSource, /names:[\s\S]*'bing\.line\.snort'/);
});

test('the transfer table visibly marks the exact diamond handoff spot', () => {
  const built = buildSilentSquatch();
  const marker = built.lab.targets.tableMarker;

  assert.equal(built.lab.targets.tableSpot.name, 'ss-transfer-table-spot');
  assert.equal(marker.name, 'ss-transfer-table-diamond');
  assert.equal(marker.visible, true);
  assert.ok(marker.isMesh);
  assert.ok(marker.material.emissiveIntensity > 0);
  assert.ok(marker.position.distanceTo(built.lab.targets.tableSpot.position) < 0.08);
});

test('the silver Sasquatch statue keeps a visibly red headband', () => {
  const grounds = buildMansionGrounds(null);
  const statue = grounds.root.getObjectByName('silver-sasquatch-statue');
  const bandana = [];
  statue.traverse((object) => {
    if (object.isMesh && object.userData?.palKey === 'bandana') bandana.push(object);
  });

  assert.ok(bandana.length > 0);
  for (const mesh of bandana) {
    const { r, g, b } = mesh.material.color;
    assert.ok(r > g * 1.5 && r > b * 1.5, 'headband material is not red');
  }
});

test('the LAN room has Zyn tins, stocked fridge drinks, and drinks on its snack table', () => {
  const grounds = buildMansionGrounds(null);
  const interior = buildMansionInterior({ grounds });
  const counts = new Map();
  interior.root.traverse((object) => {
    if (object.name) counts.set(object.name, (counts.get(object.name) ?? 0) + 1);
  });

  assert.ok((counts.get('lan-zyn-tin') ?? 0) >= 2);
  assert.ok((counts.get('lan-fridge-drink') ?? 0) >= 6);
  assert.ok((counts.get('lan-table-drink') ?? 0) >= 4);
  assert.ok((counts.get('lounge-bar-drink') ?? 0) >= 4);
});

test('the Mansion and apartment build the same named interactive bong', () => {
  const grounds = buildMansionGrounds(null);
  const interior = buildMansionInterior({ grounds });
  const bong = interior.props.lanRoom.bong;

  assert.ok(bong?.group?.isObject3D, 'the LAN-room bong is not published');
  assert.equal(bong.group.name, BONG_OBJECT_NAMES.root);
  assert.equal(bong.bowl.name, BONG_OBJECT_NAMES.bowl);
  assert.equal(bong.target.name, BONG_OBJECT_NAMES.target);
  assert.equal(bong.target.userData.bongRoot, bong.group);
  assert.match(apartmentSource, /buildInteractiveBong\(M,/);
  assert.match(apartmentSource, /registerInteractiveBong\(interaction, bong,/);
  assert.match(apartmentMainSource, /createBongBehavior\(/);
  assert.match(mansionMainSource, /createBongBehavior\(/);
  assert.match(mansionMainSource, /registerInteractiveBong\(/);
});

test('the shared bong interaction runs the apartment audio, high and smoke behavior', () => {
  const target = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 0.2));
  const bong = { target };
  const registrations = [];
  const interaction = {
    register(object, descriptor) { registrations.push({ object, descriptor }); },
  };
  const audioCalls = [];
  const smokeCalls = [];
  const highs = {
    weed: 0,
    smokeBong() { this.weed += 0.34; },
  };
  const origin = new THREE.Vector3(1, 2, 3);
  const direction = new THREE.Vector3(0, 0, -1);
  const behavior = createBongBehavior({
    audio: {
      play: (name, options) => audioCalls.push({ kind: 'play', name, options }),
      say: (name, options) => audioCalls.push({ kind: 'say', name, options }),
    },
    highs,
    smoke: { emit: (...args) => smokeCalls.push(args) },
    origin: () => origin,
    direction: () => direction,
  });
  const descriptor = registerInteractiveBong(interaction, bong, { onUse: () => behavior.use() });

  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].object, target);
  assert.equal(descriptor.label(), 'Pack a <b>bowl</b>');
  assert.equal(descriptor.hold, 0.9);
  assert.equal(descriptor.holdLabel(), 'Hold it…');
  assert.equal(descriptor.onUse(), true);
  assert.deepEqual(audioCalls.map(({ name }) => name), [
    'cig.light', 'bong.bubble', 'cig.exhale', 'bong',
  ]);
  assert.equal(highs.weed, 0.34);
  assert.equal(behavior.uses, 1);
  assert.equal(smokeCalls.length, 1);
  assert.equal(smokeCalls[0][0], origin);
  assert.equal(smokeCalls[0][1], direction);
  assert.deepEqual(smokeCalls[0][2], { count: 14, spread: 0.5, speed: 0.7 });
});

test('all four bedroom screens are mounted as shared interactive TVs', () => {
  const grounds = buildMansionGrounds(null);
  const interior = buildMansionInterior({ grounds });
  const bedrooms = Object.entries(interior.props.bedrooms);

  assert.equal(bedrooms.length, 4);
  for (const [id, bedroom] of bedrooms) {
    assert.ok(bedroom.screen, `${id} has no TV screen`);
  }

  assert.match(mansionMainSource, /const bedroomTvs = Object\.entries\(interior\.props\.bedrooms\)/);
  assert.match(mansionMainSource,
    /mountTv\(bedroom\.screen,\s*\{[\s\S]*?id: `bedroom-\$\{id\}`,[\s\S]*?on: false,[\s\S]*?glow: false,[\s\S]*?\}\)/);
  assert.match(mansionMainSource, /if \(!tv\.useGlow\) continue/);
  assert.match(mansionMainSource, /for \(const \{ tv, prop \} of interactiveTvs\)/);
  assert.match(mansionMainSource, /interactiveTvs\.push\(\.\.\.bedroomTvs\)/);
});

test('the Mansion audio verifier owns the five newly scoped toilet and suite cues', () => {
  assert.match(mansionVerifierSource,
    /import \{ PEE_CUE_NAMES \} from '\.\.\/src\/core\/pee-system\.js'/);
  assert.match(mansionVerifierSource,
    /new Set\(\[[\s\S]*\.\.\.PEE_CUE_NAMES,[\s\S]*'bing\.line\.snort'/);
});

test('the pool evening is two women reclining on loungers and one woman in the water', () => {
  const scene = new THREE.Scene();
  const grounds = buildMansionGrounds(null);
  scene.add(grounds.root);
  const interaction = {
    register(object, config) { object.userData.interact = config; },
    unregister(object) { delete object.userData.interact; },
  };
  const cast = mountMansionCast(scene, { colliders: grounds.colliders }, {
    interaction,
    player: { position: new THREE.Vector3() },
    anchors: grounds.anchors,
    pool: grounds.props.poolPatio,
    hud: {
      showLine() {}, hideLine() {}, setInstruction() {}, text: () => ({}),
    },
  });
  const composition = cast.debug.evening.poolComposition;

  assert.deepEqual(composition.map(({ id }) => id), [
    'poolPerformer0', 'poolPerformer1', 'poolPerformer2',
  ]);
  assert.deepEqual(composition.map(({ pose }) => pose), ['reclined', 'reclined', 'in-water']);
  assert.deepEqual(composition.map(({ name }) => name), [
    'the Bada Bing platinum performer',
    'the Bada Bing black-haired performer',
    'the Bada Bing brunette performer',
  ]);
  assert.deepEqual(composition.map(({ identity }) => identity), [
    { source: 'BADA_BING_PERFORMERS', index: 0, look: 'platinum tied hair' },
    { source: 'BADA_BING_PERFORMERS', index: 2, look: 'black long hair' },
    { source: 'BADA_BING_PERFORMERS', index: 1, look: 'brunette long hair' },
  ]);
  assert.equal(cast.people.poolPerformer0.inFixture, 'pool lounger');
  assert.equal(cast.people.poolPerformer1.inFixture, 'pool lounger');
  assert.equal(cast.people.poolPerformer2.inFixture, 'the pool');
  assert.ok(cast.people.poolPerformer2.group.position.y < grounds.props.poolPatio.waterY);
  assert.equal(typeof cast.people.poolPerformer0.group.userData.interact?.onUse, 'function',
    'moving the first performer removed the existing flirt/dress interaction');
  assert.equal(typeof cast.people.poolPerformer1.group.userData.interact?.onUse, 'function',
    'the other recliner has no independent flirt/dress-help interaction');
  assert.notEqual(cast.people.poolPerformer0.group, cast.people.poolPerformer1.group,
    'both prompts were mounted on the same performer');

  cast.update(1 / 60);
  const headX = cast.people.poolPerformer1.parts.head.rotation.x;
  for (let i = 0; i < 600; i++) cast.update(1 / 60);
  assert.ok(Math.abs(cast.people.poolPerformer1.parts.head.rotation.x - headX) < 1e-5,
    'the recliner head pose accumulates every frame and jitters/spins');
  assert.match(mansionMainSource, /pool: grounds\.props\.poolPatio/);
});

test('the other pool performer uses the shared seven-hit dress-help sequence', () => {
  const scene = new THREE.Scene();
  const grounds = buildMansionGrounds(null);
  scene.add(grounds.root);
  const played = [];
  const loops = [];
  const timings = [];
  const instructions = [];
  const player = { position: new THREE.Vector3(999, 999, 999) };
  const interaction = {
    register(object, config) { object.userData.interact = config; },
    unregister(object) { delete object.userData.interact; },
  };
  const cast = mountMansionCast(scene, { colliders: grounds.colliders }, {
    interaction,
    player,
    anchors: grounds.anchors,
    pool: grounds.props.poolPatio,
    /* This is the ordinary in-progress campaign state. The women are already
     * on the deck, so their E interactions must not depend on the
     * post-mission/preview evening gate. */
    eveningEnabled: () => false,
    audio: {
      hasSample: () => false,
      play(name, options) { played.push({ name, options }); return null; },
      startLoop(key, options) { loops.push({ kind: 'start', key, name: options.name }); },
      stopLoop(key) { loops.push({ kind: 'stop', key }); },
    },
    hud: {
      showLine() {}, hideLine() {}, setInstruction(value) { instructions.push(value); },
      setTiming(view) { timings.push(view); },
      text: () => ({}),
    },
  });

  const first = cast.people.poolPerformer0.group.userData.interact.onUse;
  const other = cast.people.poolPerformer1.group.userData.interact.onUse;
  assert.notEqual(first, other);
  assert.equal(cast.people.poolPerformer0.group.userData.interact.enabled(), true,
    'the first pool performer is disabled during the in-progress campaign');
  assert.equal(cast.people.poolPerformer1.group.userData.interact.enabled(), true,
    'the other pool performer is disabled during the in-progress campaign');
  const secondStrap = cast.people.poolPerformer1.parts.body
    .getObjectByName('pool-performer-2-dress-strap');
  assert.ok(secondStrap, 'the other performer has no authored strap rig');
  const strapStart = { y: secondStrap.position.y, z: secondStrap.rotation.z };
  const headStart = cast.people.poolPerformer1.parts.head.rotation.x;
  const settle = (seconds) => {
    for (let t = 0; t < seconds; t += 1 / 60) cast.update(1 / 60);
  };

  assert.equal(other(), true); // hello
  settle(8);
  assert.equal(other(), true); // flirt
  settle(8);
  assert.equal(other(), true); // begin the timing bar
  assert.equal(cast.debug.evening.secondDress.active, true);
  cast.update(1 / 60);

  cast.debug.setSecondPoolDressTarget(true);
  assert.equal(other(), true, 'the abandoned take never accepted its first pull');
  assert.equal(cast.debug.secondPoolDress.hits, 1);
  assert.notEqual(secondStrap.position.y, strapStart.y,
    'the first pull did not visibly move the strap before abandon');
  assert.equal(cast.debug.abandonSecondPoolDress(), true);
  assert.equal(cast.debug.secondPoolDress.active, false);
  assert.equal(cast.debug.secondPoolDress.hits, 0,
    'abandon left the prior take hits in the shared sequence');
  assert.equal(cast.debug.secondPoolDress.misses, 0,
    'abandon left the prior take misses in the shared sequence');
  assert.equal(cast.debug.evening.secondDressPhase, 'ready');
  assert.equal(cast.debug.evening.secondDressHelped, false);
  assert.ok(Math.abs(secondStrap.position.y - strapStart.y) < 1e-9,
    'abandon did not reset the Mansion strap rig');
  assert.ok(Math.abs(secondStrap.rotation.z - strapStart.z) < 1e-9,
    'abandon did not reset the Mansion strap angle');
  assert.ok(Math.abs(cast.people.poolPerformer1.parts.head.rotation.x - headStart) < 1e-9,
    'abandon disturbed the recliner head pose');
  assert.equal(timings.at(-1), null, 'abandon left the TimingBar on the Mansion HUD');
  assert.equal(instructions.at(-1), null, 'abandon left the pull instruction on the Mansion HUD');
  assert.equal(cast.debug.evening.secondDress.clapStage, 0,
    'abandon left a wet-clap loop active');
  assert.ok(loops.some(({ kind, key }) => kind === 'stop' && key === 'margo.dress.clap'),
    'abandon never stopped the shared clap loop');

  const playedBeforeRetry = played.length;
  const loopsBeforeRetry = loops.length;
  assert.equal(other(), true, 'the Mansion adapter refused a clean retry after abandon');
  assert.equal(cast.debug.secondPoolDress.active, true);

  cast.debug.setSecondPoolDressTarget(false);
  assert.equal(other(), false, 'a miss should not count as a pull');
  assert.equal(cast.debug.secondPoolDress.hits, 0);
  assert.equal(cast.debug.secondPoolDress.misses, 1);

  for (let i = 0; i < 7; i++) {
    cast.debug.setSecondPoolDressTarget(true);
    assert.equal(other(), true, `authored pull ${i + 1} was refused`);
  }
  assert.equal(cast.debug.secondPoolDress.hits, 7);
  assert.equal(cast.debug.secondPoolDress.active, false);
  assert.equal(cast.debug.evening.secondDressHelped, true);
  cast.update(1 / 60);
  assert.equal(timings.at(-1), null,
    'the frame after completion put PULL 7 / 7 back over the payoff subtitle');
  const retryPlayed = played.slice(playedBeforeRetry);
  const retryLoops = loops.slice(loopsBeforeRetry);
  assert.equal(retryPlayed.filter(({ name }) => name === 'clap.wet.finish').length, 1);
  assert.ok(retryPlayed.filter(({ name }) => /^moan\./.test(name)).length === 7);
  assert.deepEqual(retryLoops.filter(({ kind }) => kind === 'start').map(({ name }) => name), [
    'clap.wet.loop.1', 'clap.wet.loop.2', 'clap.wet.loop.3',
  ]);
  assert.ok(timings.some(Boolean), 'the shared TimingBar never reached the Mansion HUD');
});

test('the quiet evening seats Old Stove with Seff and Lag in real theatre recliners', () => {
  const scene = new THREE.Scene();
  const grounds = buildMansionGrounds(null);
  const interior = buildMansionInterior({ grounds });
  scene.add(grounds.root, interior.root);
  let evening = false;
  const interaction = {
    register(object, config) { object.userData.interact = config; },
    unregister(object) { delete object.userData.interact; },
  };
  const cast = mountMansionCast(scene, { colliders: [...grounds.colliders, ...interior.colliders] }, {
    interaction,
    player: { position: new THREE.Vector3() },
    anchors: { ...grounds.anchors, ...interior.anchors },
    pool: grounds.props.poolPatio,
    theatre: interior.props.theatre,
    eveningEnabled: () => evening,
    theatreChannel: () => 'GOODFELLAS',
    hud: { showLine() {}, hideLine() {}, setInstruction() {}, text: () => ({}) },
  });

  cast.update(1 / 60);
  assert.equal(cast.debug.evening.theatreStaged, false);
  assert.equal(cast.people.oldStove.job, 'sit',
    'Old Stove must already sit before the post-mission evening');
  assert.equal(cast.people.oldStove.inFixture, 'theatre recliner');
  const stoveBeforeEvening = cast.seats().find(({ id }) => id === 'oldStove');
  assert.ok(stoveBeforeEvening, 'Old Stove is absent from the pre-completion seated-body report');
  assert.notEqual(stoveBeforeEvening.seat, null, 'Old Stove has no recliner surface before mission completion');
  assert.ok(Math.abs(stoveBeforeEvening.gap) <= 0.08,
    `Old Stove is ${stoveBeforeEvening.gap} m off his recliner before mission completion`);
  assert.equal(cast.people.seff.job, 'work');
  assert.notEqual(cast.people.lag.inFixture, 'theatre recliner');

  evening = true;
  cast.update(1 / 60);
  const staged = cast.debug.evening;
  assert.equal(staged.theatreStaged, true);
  assert.deepEqual(staged.theatreComposition, [
    { id: 'oldStove', name: 'Old Stove', seat: 1, job: 'sit' },
    { id: 'seff', name: 'Seff', seat: 3, job: 'sit' },
    { id: 'lag', name: 'Lag', seat: 5, job: 'sit' },
  ]);
  for (const { id, seat } of staged.theatreComposition) {
    const npc = cast.people[id];
    const recliner = interior.props.theatre.seats[seat];
    const reclinerAt = recliner.getWorldPosition(new THREE.Vector3());
    assert.equal(npc.inFixture, 'theatre recliner');
    assert.ok(Math.abs(npc.group.position.x - reclinerAt.x) < 0.05, `${id} missed recliner ${seat}`);
    assert.ok(Math.abs(npc.group.position.z - reclinerAt.z) < 0.08, `${id} missed recliner ${seat}`);
  }
  const theatreSeats = cast.seats().filter(({ id }) => ['oldStove', 'seff', 'lag'].includes(id));
  assert.equal(theatreSeats.length, 3, 'the evening companions were staged near seats but never registered as seated bodies');
  for (const report of theatreSeats) {
    assert.notEqual(report.seat, null, `${report.id} has no recliner surface under his hips`);
    assert.ok(Math.abs(report.gap) <= 0.08, `${report.id} is ${report.gap} m off the recliner surface`);
  }
  for (const [seat, id] of [[1, 'oldStove'], [3, 'seff'], [5, 'lag']]) {
    const recliner = interior.props.theatre.seats[seat];
    assert.equal(theatreSeatOccupant(recliner), id,
      `theatre seat ${seat} does not publish its cast occupant`);
    assert.equal(theatreSeatAvailable(recliner, { activeSeat: null, playerMode: 'walk' }), false,
      `the player can sit inside ${id} in theatre seat ${seat}`);
  }
  const openSeat = interior.props.theatre.seats[0];
  assert.equal(theatreSeatOccupant(openSeat), null);
  assert.equal(theatreSeatAvailable(openSeat, { activeSeat: null, playerMode: 'walk' }), true,
    'an unoccupied theatre chair was disabled with the occupied ones');
  assert.match(mansionMainSource,
    /theatreSeatAvailable\(seat,\s*\{[\s\S]*?activeSeat: activeTheatreSeat,[\s\S]*?playerMode: player\.mode/,
    'the production sit path does not consult cast seat occupancy');
  assert.match(mansionMainSource, /theatre: interior\.props\.theatre/);
});

test('xXx fatal visuals and scene-local fate persist after death', () => {
  const built = buildSilentSquatch();
  const xxx = built.lab.xxx;

  assert.equal(xxx.alive, true);
  assert.equal(xxx.fatalPool, null);
  built.root.updateMatrixWorld(true);
  const point = xxx.aim.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0.08, 0.12, 0.1));
  assert.equal(xxx.kill('firearm', {
    object: xxx.aim,
    point: point.clone(),
    from: point.clone().add(new THREE.Vector3(0, 0, 3)),
  }), true);
  assert.equal(xxx.alive, false);
  assert.equal(xxx.deathCause, 'firearm');
  assert.equal(xxx.fatalPool.visible, true);
  assert.equal(xxx.fatalPool.name.startsWith(BLOOD_POOL_NAME), true);
  const wound = xxx.fatalMarks.find((mark) => mark.name === BLOOD_MARK_NAME);
  assert.ok(wound, 'xXx has no shared entry wound');
  built.root.updateMatrixWorld(true);
  assert.ok(wound.getWorldPosition(new THREE.Vector3()).distanceTo(point) <= 0.008,
    'xXx firearm wound did not use the real WeaponSystem hit point');
  assert.ok(xxx.fatalMarks.every((mark) => mark.userData.reusableSystem === 'blood'));
  assert.equal(xxx.say(null), false, 'a dead xXx kept talking');
  built.update(12);
  assert.equal(xxx.alive, false);
  assert.equal(xxx.deathCause, 'firearm');
  assert.equal(xxx.kill('whip'), false, 'a second death replaced the first cause');
  assert.match(mansionMainSource, /silent\?\.lab\?\.targets\?\.xxx/);
  assert.match(mansionMainSource, /applyXxxFirearmImpact\(\{/);
  assert.match(mansionMainSource, /restartScene:\s*\(\) => \{[\s\S]*lab\.blood\.reset\(\)/,
    'Restart Scene never invokes the reusable blood lifecycle');
  assert.match(mansionMainSource, /restartCheckpoint:[\s\S]*lab\.blood\.reset\(\)/,
    'Restart Checkpoint never invokes the reusable blood lifecycle');
});
