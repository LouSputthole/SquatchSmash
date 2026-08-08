import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as THREE from 'three';

import { PEE_CUE_NAMES, PeeSystem } from '../src/core/pee-system.js';
import { FocusRush } from '../src/core/focus-rush.js';
import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const {
  buildMansionGrounds, GROUND_Y, POOL, UPPER_Y,
} = await import('../src/mansion/scenes/MansionGrounds.js');
const {
  buildMansionInterior, MANSION_ART_SLOTS,
} = await import('../src/mansion/scenes/MansionInterior.js');
const { buildSilentSquatch } = await import('../src/mansion/scenes/SilentSquatch.js');
const { mountMansionCast } = await import('../src/mansion/cast.js');
const mansionMainSource = readFileSync(new URL('../src/mansion/main.js', import.meta.url), 'utf8');
const bingMainSource = readFileSync(new URL('../src/bing/main.js', import.meta.url), 'utf8');
const mansionVerifierSource = readFileSync(new URL('../tools/verify-mansion.mjs', import.meta.url), 'utf8');
const artManifest = JSON.parse(readFileSync(new URL('../assets/art/manifest.json', import.meta.url), 'utf8'));

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
  assert.equal(cast.people.poolPerformer0.inFixture, 'pool lounger');
  assert.equal(cast.people.poolPerformer1.inFixture, 'pool lounger');
  assert.equal(cast.people.poolPerformer2.inFixture, 'the pool');
  assert.ok(cast.people.poolPerformer2.group.position.y < grounds.props.poolPatio.waterY);
  assert.equal(typeof cast.people.poolPerformer0.group.userData.interact?.onUse, 'function',
    'moving the first performer removed the existing flirt/dress interaction');
  assert.match(mansionMainSource, /pool: grounds\.props\.poolPatio/);
});
