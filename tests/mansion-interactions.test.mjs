import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as THREE from 'three';

import { PEE_CUE_NAMES, PeeSystem } from '../src/core/pee-system.js';
import { FocusRush } from '../src/core/focus-rush.js';
import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const { buildMansionGrounds, UPPER_Y } = await import('../src/mansion/scenes/MansionGrounds.js');
const { buildMansionInterior } = await import('../src/mansion/scenes/MansionInterior.js');
const { buildSilentSquatch } = await import('../src/mansion/scenes/SilentSquatch.js');
const { mountMansionCast } = await import('../src/mansion/cast.js');
const mansionMainSource = readFileSync(new URL('../src/mansion/main.js', import.meta.url), 'utf8');
const bingMainSource = readFileSync(new URL('../src/bing/main.js', import.meta.url), 'utf8');
const mansionVerifierSource = readFileSync(new URL('../tools/verify-mansion.mjs', import.meta.url), 'utf8');

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
