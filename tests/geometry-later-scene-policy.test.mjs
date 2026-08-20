import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const [{ buildGeometrySceneState }, THREE, { PALACE_GUARD_POSTS }] = await Promise.all([
  import('../tools/geometry-scenes.mjs'),
  import('three'),
  import('../src/cartel-palace/cast.js'),
]);

function objectsNamed(root, name) {
  const matches = [];
  root.traverse((object) => {
    if (object?.name === name) matches.push(object);
  });
  return matches;
}

function onlyNamed(root, name) {
  const matches = objectsNamed(root, name);
  assert.equal(matches.length, 1, `expected one ${name}, found ${matches.length}`);
  return matches[0];
}

function gate(object) {
  return object.userData?.geometryGate ?? {};
}

test('Golf Adapter separates compound scenery and per-person assemblies', async () => {
  const built = await buildGeometrySceneState('golf:hole-three');
  const root = built.roots[0].root;

  assert.equal(gate(onlyNamed(root, 'course')).overlap, false);
  assert.equal(gate(onlyNamed(root, 'clubhouse')).assemblyId, 'golf-clubhouse');
  assert.equal(gate(onlyNamed(root, 'clubhouse')).overlap, undefined);

  const people = objectsNamed(root, 'person');
  assert.equal(people.length, 8);
  const gallery = people.filter((person) => gate(person).assemblyId?.startsWith('golf-gallery-person-'));
  const golfers = people.filter((person) => gate(person).assemblyId?.startsWith('golf-runtime-golfer:'));
  assert.equal(gallery.length, 5);
  assert.equal(golfers.length, 3);
  assert.equal(gallery.every((person) => gate(person).checkSupport === undefined), true);
  assert.equal(golfers.every((person) => gate(person).checkSupport === undefined), true);
  assert.equal(new Set(people.map((person) => gate(person).assemblyId)).size, people.length);

  const carts = [];
  root.traverse((object) => {
    if (gate(object).assemblyId?.startsWith('golf-runtime-cart:')) carts.push(object);
  });
  assert.equal(carts.length, 2);
  assert.equal(carts.every((cart) => gate(cart).checkSupport === undefined), true);
  const laterBag = onlyNamed(root, 'three-club-stand-bag');
  assert.equal(laterBag.visible, false, 'the collected Hole 1 bag must not float in later states');
  assert.equal(gate(laterBag).checkSupport, undefined);

  const supportNames = built.colliders
    .filter(({ name }) => name?.startsWith('golf-terrain-support-'))
    .map(({ name }) => name)
    .sort();
  assert.deepEqual(supportNames, [
    'golf-terrain-support-cart-follow',
    'golf-terrain-support-cart-lead',
    'golf-terrain-support-gallery-0',
    'golf-terrain-support-gallery-1',
    'golf-terrain-support-gallery-2',
    'golf-terrain-support-gallery-3',
    'golf-terrain-support-gallery-4',
    'golf-terrain-support-golfer-eric',
    'golf-terrain-support-golfer-lou',
    'golf-terrain-support-golfer-rippinflow',
  ]);
  assert.equal(built.metadata.producerCounts.terrainSupportPatches, 10);
  assert.equal(
    built.colliders.filter(({ name }) => name === 'golf-clubhouse-foundation').length,
    1,
  );

  const holeOne = await buildGeometrySceneState('golf:hole-one');
  assert.equal(onlyNamed(holeOne.roots[0].root, 'three-club-stand-bag').visible, true);
  assert.equal(holeOne.metadata.producerCounts.terrainSupportPatches, 6);
  assert.ok(holeOne.colliders.some(({ name }) => name === 'golf-terrain-support-bag'));

  const teeBalls = objectsNamed(root, 'golf-ball-lou')
    .concat(objectsNamed(root, 'golf-ball-rippinflow'))
    .concat(objectsNamed(root, 'golf-ball-eric'))
    .concat(objectsNamed(root, 'golf-ball-prospect'));
  assert.equal(teeBalls.length, 4);
  assert.equal(teeBalls.every((ball) => (
    gate(ball).assemblyId === 'golf-runtime-tee-balls'
    && gate(ball).checkSupport === false
    && gate(ball).overlap === undefined
  )), true);
});

test('Golf policy pins all four clean states and keeps dynamic terrain support physical', async () => {
  const allowlist = JSON.parse(await readFile(
    new URL('../tools/geometry-allowlists/golf.json', import.meta.url),
    'utf8',
  ));
  assert.deepEqual(allowlist.entries, []);
  const expected = {
    grille: { overlap: 1063, checkSupport: 994, sources: 19, inherited: 3 },
    'hole-one': { overlap: 1369, checkSupport: 1106, sources: 21, inherited: 5 },
    'hole-three': { overlap: 1063, checkSupport: 994, sources: 19, inherited: 3 },
    'hole-two': { overlap: 1831, checkSupport: 1252, sources: 20, inherited: 4 },
  };
  assert.deepEqual(allowlist.suppressionPolicy.map(({ state }) => state), Object.keys(expected));
  for (const policy of allowlist.suppressionPolicy) {
    const wanted = expected[policy.state];
    assert.equal(policy.overlap, wanted.overlap, policy.state);
    assert.equal(policy.checkSupport, wanted.checkSupport, policy.state);
    assert.equal(policy.sources.length, wanted.sources, policy.state);
    assert.equal(
      policy.sources.filter(({ scope }) => scope === 'inherited').length,
      wanted.inherited,
      policy.state,
    );
    assert.equal(policy.sources.reduce((sum, item) => sum + item.overlap, 0), policy.overlap);
    assert.equal(
      policy.sources.reduce((sum, item) => sum + item.checkSupport, 0),
      policy.checkSupport,
    );
    assert.ok(policy.sources.every(({ sourceId }) => sourceId.startsWith(`root:golf-`)));
    assert.ok(policy.sources.every(({ sourceId }) => (
      !/(?:name=person|golf-cart|three-club-stand-bag)/.test(sourceId)
    )), `${policy.state} must use terrain support colliders for people, carts, and bag`);
  }
});

test('Silver Adapter identifies scenic, mounted, and fitted assemblies', async () => {
  const built = await buildGeometrySceneState('silver:default');
  const root = built.roots[0].root;

  for (const name of ['city-blocks', 'city-rooftops', 'city-warning-lights']) {
    assert.deepEqual(
      { overlap: gate(onlyNamed(root, name)).overlap, checkSupport: gate(onlyNamed(root, name)).checkSupport },
      { overlap: false, checkSupport: false },
      name,
    );
  }
  const moon = onlyNamed(root, 'moon');
  assert.deepEqual(gate(moon), {});
  const moonMeshes = [];
  moon.traverse((object) => { if (object.isMesh) moonMeshes.push(object); });
  assert.equal(moonMeshes.length, 5);
  assert.equal(moonMeshes.every((mesh) => (
    gate(mesh).overlap === false && gate(mesh).checkSupport === false
  )), true);

  assert.equal(objectsNamed(root, 'dish-wall-rack').length, 5);
  assert.equal(objectsNamed(root, 'stage-spotlight').length, 5);
  for (const name of ['coat-rail', 'knife-blade', 'dish-wall-rack', 'stage-spotlight']) {
    assert.equal(objectsNamed(root, name).every((object) => gate(object).checkSupport === false), true, name);
  }

  for (const name of ['front-canopy', 'fire-escape', 'entry-ramp', 'kitchen-ramp', 'stage-installation']) {
    const fixture = onlyNamed(root, name);
    assert.equal(gate(fixture).assemblyId, 'silver-building-shell', name);
    assert.equal(gate(fixture).fixedSupportAnchor, true, name);
    assert.equal(gate(fixture).checkSupport, undefined, name);
  }
  const cityGround = objectsNamed(root, 'silver-city-ground-0')
    .concat(objectsNamed(root, 'silver-city-ground-1'), objectsNamed(root, 'silver-city-ground-2'), objectsNamed(root, 'silver-city-ground-3'));
  assert.equal(cityGround.length, 4);
  assert.equal(cityGround.every((object) => gate(object).structural === true && gate(object).overlap === false), true);

  assert.equal(onlyNamed(root, 'linen-shelf').position.x, 10.43);
  assert.equal(onlyNamed(root, 'spare-chairs').position.x, 10.55);
  assert.equal(onlyNamed(root, 'mop-bucket').position.x, 10.55);
  assert.equal(objectsNamed(root, 'dish-wall-rack').every((rack) => rack.position.y >= 1.2), true);
  assert.equal(objectsNamed(root, 'dish-wall-rack').every((rack) => gate(rack).wall === false), true);

  for (const name of ['extraction-hood-canopy', 'extraction-hood-lip', 'pot-rack', 'hood-utensils']) {
    assert.equal(gate(onlyNamed(root, name)).assemblyId, 'silver-extraction-hood', name);
  }
  for (const name of ['stage-curtain', 'stage-proscenium-pelmet']) {
    assert.equal(gate(onlyNamed(root, name)).assemblyId, 'silver-building-shell', name);
  }
  assert.equal(objectsNamed(root, 'stage-proscenium-leg').length, 2);
  assert.equal(
    objectsNamed(root, 'stage-proscenium-leg').every((object) => gate(object).assemblyId === 'silver-building-shell'),
    true,
  );

  for (const name of [
    'frame', 'sconce', 'staff-mirror', 'ticket-board', 'card-rack', 'curtain',
    'floor-plate', 'prep-shelf-board', 'prep-shelf-tub', 'knife-rail',
    'prep-board', 'wallclock', 'rota-board', 'fire-point', 'hose-reel',
    'service-door-light', 'kitchen-strip-light',
  ]) {
    assert.equal(objectsNamed(root, name).every((object) => gate(object).assemblyId === 'silver-building-shell'), true, name);
    assert.equal(objectsNamed(root, name).every((object) => gate(object).checkSupport === false), true, name);
  }
  const coatCheck = objectsNamed(root, 'person').find((person) => (
    gate(person).assemblyId === 'silver-cast:coatcheck'
  ));
  assert.ok(coatCheck, 'missing Silver coat-check attendant');
  const coatCheckBounds = new THREE.Box3().setFromObject(coatCheck);
  const railBounds = new THREE.Box3().setFromObject(onlyNamed(root, 'coat-rail'));
  assert.ok(railBounds.min.x - coatCheckBounds.max.x > 0.03);
  for (const collider of built.colliders) {
    const overlapX = Math.min(coatCheckBounds.max.x, collider.max.x)
      - Math.max(coatCheckBounds.min.x, collider.min.x);
    const overlapY = Math.min(coatCheckBounds.max.y, collider.max.y)
      - Math.max(coatCheckBounds.min.y, collider.min.y);
    const overlapZ = Math.min(coatCheckBounds.max.z, collider.max.z)
      - Math.max(coatCheckBounds.min.z, collider.min.z);
    assert.ok(
      overlapX <= 0.03 || overlapY <= 0.03 || overlapZ <= 0.03,
      `coat-check attendant intersects ${collider.name || 'an unnamed collider'}`,
    );
  }

  assert.equal(gate(onlyNamed(root, 'dish-rack')).assemblyId, 'silver-dish-station');
  assert.equal(gate(onlyNamed(root, 'dish-station')).assemblyId, 'silver-dish-station');
  assert.equal(gate(onlyNamed(root, 'queue-barrier')).assemblyId, 'silver-queue-barrier');
  assert.equal(gate(onlyNamed(root, 'queue-barrier')).fixedSupportAnchor, true);
  for (const z of [38, 48, 58]) {
    assert.equal(gate(onlyNamed(root, `street-lamp-${z}`)).assemblyId, `silver-street-lamp-${z}`);
  }

  for (const side of ['west', 'east']) {
    const rack = onlyNamed(root, `walkin-hook-rack-${side}`);
    assert.equal(gate(rack).assemblyId, `silver-walkin-hook-rack-${side}`);
    assert.equal(gate(rack).checkSupport, undefined, 'visible hangers must prove support');
    assert.equal(objectsNamed(rack, 'walkin-meat-hook').length, 3);
    assert.equal(objectsNamed(rack, 'walkin-hook-rail').length, 1);
    const hangers = objectsNamed(rack, 'walkin-hook-hanger');
    assert.equal(hangers.length, 2);
    assert.equal(
      hangers.every((hanger) => Math.abs(new built.THREE.Box3().setFromObject(hanger).max.y - (-0.5)) < 1e-9),
      true,
      `${side} walk-in hook rack hangers must meet the cellar ceiling`,
    );
  }

  const ticketRail = onlyNamed(root, 'pass-ticket-rail');
  assert.equal(gate(ticketRail).assemblyId, 'silver-pass-ticket-rail');
  assert.equal(gate(ticketRail).checkSupport, undefined, 'visible posts must prove support');
  assert.equal(objectsNamed(ticketRail, 'pass-ticket').length, 9);
  assert.equal(objectsNamed(ticketRail, 'pass-ticket-rail-bar').length, 1);
  const ticketPosts = objectsNamed(ticketRail, 'pass-ticket-rail-post');
  assert.equal(ticketPosts.length, 2);
  assert.equal(
    ticketPosts.every((post) => {
      const bounds = new built.THREE.Box3().setFromObject(post);
      return Math.abs(bounds.min.y - 1.025) < 1e-9 && Math.abs(bounds.max.y - 1.695) < 1e-9;
    }),
    true,
    'ticket rail posts must bridge the pass top to the rail',
  );

  const doors = [];
  root.traverse((object) => {
    if (/^silver-door-/.test(object?.name ?? '')) doors.push(object);
  });
  assert.ok(doors.length >= 5);
  assert.equal(doors.every((door) => gate(door).assemblyId === 'silver-building-shell'), true);

  for (let index = 0; index < 5; index += 1) {
    const banquette = onlyNamed(root, `east-banquette-${index}`);
    assert.equal(gate(banquette).assemblyId, `silver-east-banquette-${index}`);
    assert.equal(objectsNamed(banquette, 'east-banquette-seat-base').length, 1);
    assert.equal(objectsNamed(banquette, 'east-banquette-back').length, 1);
  }

  const walls = [];
  root.traverse((object) => {
    if (/^silver-wall-\d+$/.test(object?.name ?? '')) walls.push(object);
  });
  assert.ok(walls.length > 20);
  assert.equal(walls.every((wall) => gate(wall).wall === true), true);
  assert.equal(walls.every((wall) => gate(wall).assemblyId === 'silver-building-shell'), true);
});

test('NO WAKE weighted checkpoint mounts runtime cast, body rig, and both boat collider spaces', async () => {
  const built = await buildGeometrySceneState('nowake:weighted');
  const root = built.roots[0].root;

  assert.deepEqual(gate(onlyNamed(root, '42-foot express cruiser')), {});
  assert.deepEqual(gate(onlyNamed(root, 'cream fiberglass hull')), {
    assemblyId: 'no-wake-cruiser-hull-shell',
    overlap: false,
    checkSupport: false,
    fixedSupportAnchor: true,
  });
  assert.equal(gate(onlyNamed(root, 'South Harbor · Gate C finger')).assemblyId, 'no-wake-gate-c-dock');
  assert.deepEqual(gate(onlyNamed(root, 'dock mooring rope')), {
    assemblyId: 'no-wake-dock-mooring-rope',
  });
  assert.deepEqual(gate(onlyNamed(root, 'dock mooring rope strand')), { overlap: false });
  assert.equal(gate(onlyNamed(root, 'harbor shoreline bank')).structural, true);
  assert.deepEqual(gate(onlyNamed(root, 'cabin sole')), {
    checkSupport: false,
    fixedSupportAnchor: true,
    assemblyId: 'no-wake-cabin-fixed-fitout',
  });

  const bounds = (name) => new THREE.Box3().setFromObject(onlyNamed(root, name));
  const engineHatch = bounds('engine hatch lid');
  for (const name of [
    'cockpit seat base · forward leg',
    'helm bench base',
    'stern hatch lid',
  ]) {
    assert.equal(
      engineHatch.intersectsBox(bounds(name)),
      false,
      `the serviceable engine hatch still runs underneath ${name}`,
    );
  }
  assert.equal(
    bounds('bow sun pad cushion').intersectsBox(bounds('forward locker lid')),
    false,
    'the sun pad still blocks the ballast-locker lid',
  );
  const foredeck = bounds('cabin trunk roof · foredeck');
  for (const name of ['searchlight pedestal', 'bow navigation light housing']) {
    const fixture = bounds(name);
    assert.ok(
      Math.abs(fixture.min.y - foredeck.max.y) <= 0.001,
      `${name} must land on the foredeck datum`,
    );
  }
  assert.equal(
    bounds('hanging dock fender 3').intersectsBox(bounds('port cockpit coaming')),
    false,
    'the aft fender must hang outside the coaming',
  );

  const castRoots = [];
  root.traverse((object) => {
    if (gate(object).assemblyId?.startsWith('no-wake-cast:')) castRoots.push(object);
  });
  assert.equal(castRoots.length, 4);
  assert.equal(new Set(castRoots.map((object) => gate(object).assemblyId)).size, 4);
  assert.equal(gate(onlyNamed(root, 'wrapped body rig')).assemblyId, 'no-wake-body-rig');
  assert.equal(built.metadata.bodyStage, 'weighted');
  assert.equal(built.metadata.castCount, 4);
  assert.ok(built.metadata.deckColliderCount > 0);
  assert.ok(built.metadata.cabinColliderCount > 0);
  assert.equal(
    built.colliders.filter(({ name }) => name?.startsWith('no-wake-boat-deck:')).length,
    built.metadata.deckColliderCount,
  );
  assert.equal(
    built.colliders.filter(({ name }) => name?.startsWith('no-wake-boat-cabin:')).length,
    built.metadata.cabinColliderCount,
  );
  assert.deepEqual(
    built.metadata.producers,
    ['buildNoWakeWorld', 'createBodyRig', 'stageNoWakeCheckpointGeometry'],
  );
});

test('NO WAKE policy pins exact fitted joints and only direct support provenance', async () => {
  const allowlist = JSON.parse(await readFile(
    new URL('../tools/geometry-allowlists/nowake.json', import.meta.url),
    'utf8',
  ));
  const expectedByState = {
    body: 28,
    confrontation: 28,
    dock: 29,
    inlet: 28,
    return: 28,
    underway: 28,
    weighted: 28,
  };

  assert.equal(allowlist.entries.length, 197);
  assert.deepEqual(
    Object.fromEntries(Object.keys(expectedByState).map((state) => [
      state,
      allowlist.entries.filter((entry) => entry.state === state).length,
    ])),
    expectedByState,
  );
  assert.equal(
    new Set(allowlist.entries.map(({ kind, left, right }) => `${kind}|${left}|${right}`)).size,
    29,
  );
  for (const entry of allowlist.entries) {
    assert.equal(entry.kind, 'INTERPENETRATION');
    assert.doesNotMatch(entry.left, /[*?\[\]]/);
    assert.doesNotMatch(entry.right, /[*?\[\]]/);
    assert.ok(entry.left.startsWith('root:no-wake/'));
    assert.ok(entry.right.startsWith('root:no-wake/'));
  }

  assert.deepEqual(
    allowlist.suppressionPolicy.map(({ state }) => state),
    Object.keys(expectedByState),
  );
  for (const policy of allowlist.suppressionPolicy) {
    const dock = policy.state === 'dock';
    assert.equal(policy.overlap, dock ? 10 : 9);
    assert.equal(policy.checkSupport, 24);
    assert.equal(policy.sources.length, dock ? 33 : 32);
    assert.equal(policy.sources.reduce((sum, source) => sum + source.overlap, 0), policy.overlap);
    assert.equal(
      policy.sources.reduce((sum, source) => sum + source.checkSupport, 0),
      policy.checkSupport,
    );
    assert.ok(policy.sources.every(({ scope, sourceId }) => (
      scope === 'direct'
      && sourceId.startsWith('root:no-wake/')
      && sourceId !== 'root:no-wake'
    )));
    assert.ok(policy.sources.some(({ sourceId, checkSupport }) => (
      sourceId.endsWith('/name=cabin%20sole#0') && checkSupport === 1
    )));
    assert.ok(policy.sources.every(({ sourceId }) => (
      sourceId !== 'root:no-wake/name=dock%20mooring%20rope#0'
    )));
  }
});

test('Enola preflight checkpoint composes terrain, scatter, airfield, aircraft, payload, crew, cart, city, and weather', async () => {
  const built = await buildGeometrySceneState('enolasquatch:preflight');
  const root = built.roots[0].root;

  const aircraft = onlyNamed(root, 'enola-squatch');
  assert.equal(gate(aircraft).assemblyId, undefined);
  assert.deepEqual(gate(onlyNamed(root, 'main-wing')), {
    assemblyId: 'enola-aircraft:wing',
    checkSupport: false,
    fixedSupportAnchor: true,
  });
  assert.equal(gate(onlyNamed(root, 'fat-squatch')).assemblyId, 'enola-fat-squatch-payload');
  assert.equal(gate(onlyNamed(root, 'tool-cart')).assemblyId, 'enola-tool-cart');
  assert.equal(gate(onlyNamed(root, 'eastbound terrain ground')).structural, true);
  assert.equal(onlyNamed(root, 'eastbound terrain scatter').count, 620);
  assert.ok(onlyNamed(root, 'whispering-pines-scenery').parent);
  assert.ok(onlyNamed(root, 'squatchbourg').parent);

  const crewRoots = [];
  root.traverse((object) => {
    if (gate(object).supportAssemblyId?.endsWith(':occupant')) crewRoots.push(object);
  });
  assert.equal(crewRoots.length, 4);
  assert.equal(new Set(crewRoots.map((object) => gate(object).assemblyId)).size, 4);
  assert.equal(crewRoots.every((object) => gate(object).checkSupport === false), true);
  const cloudMeshes = [];
  onlyNamed(root, 'clouds').traverse((object) => { if (object.isMesh) cloudMeshes.push(object); });
  assert.ok(cloudMeshes.length > 0);
  assert.equal(cloudMeshes.every((cloud) => gate(cloud).overlap === false), true);
  assert.equal(cloudMeshes.every((cloud) => gate(cloud).checkSupport === false), true);

  assert.equal(built.metadata.crewCount, 4);
  assert.equal(built.metadata.crewAboard, true);
  assert.equal(built.metadata.eastScatterCount, 620);
  assert.equal(built.metadata.weatherCloudCount, 44);
  assert.equal(built.metadata.payloadReleased, false);
  assert.equal(built.metadata.cityDestroyed, false);

  const crows = objectsNamed(root, 'crow');
  assert.equal(crows.length, 4);
  assert.equal(crows.every((crow) => gate(crow).overlap === false), true);
  const opsShack = onlyNamed(root, 'ops-shack');
  const opsShackBodies = opsShack.children.filter((object) => (
    object.isMesh
    && object.geometry?.type === 'BoxGeometry'
    && object.geometry?.parameters?.width === 7
    && object.geometry?.parameters?.height === 3.2
    && object.geometry?.parameters?.depth === 5
  ));
  assert.equal(opsShackBodies.length, 1);
  assert.equal(gate(opsShackBodies[0]).overlap, false);
});

test('Enola detonation checkpoint owns crater layers and omits collapsed placeholders', async () => {
  const built = await buildGeometrySceneState('enolasquatch:detonation');
  const root = built.roots[0].root;
  const crater = onlyNamed(root, 'squatchbourg-crater');
  const glow = onlyNamed(root, 'squatchbourg-crater-glow');
  assert.equal(gate(crater).assemblyId, 'enola-squatchbourg-crater');
  assert.equal(gate(glow).assemblyId, 'enola-squatchbourg-crater');
  assert.equal(built.metadata.cityDestroyed, true);
  assert.equal(built.metadata.payloadReleased, true);
  assert.equal(
    objectsNamed(root, 'squatchbourg').length,
    1,
    'the initial detonation frame keeps the shock-front outskirts for later collapse',
  );
});

test('Enola allowlist pins all six public states to exact fitted-airframe residuals and suppressions', async () => {
  const allowlist = JSON.parse(await readFile(
    new URL('../tools/geometry-allowlists/enolasquatch.json', import.meta.url),
    'utf8',
  ));
  /* Re-pinned 2026-08-19 after the owner playtest pass. The airframe grew a
   * rear-gun mount structure, a full canopy, two seat restraints and a
   * bombardier station, so both halves of this census moved: every citation's
   * line number, and the suppression counts (six more `overlap: false` surfaces
   * per state — the connecting structure's collar and traverse ring, the new
   * glazing, the bombardier cushion). The gate itself reports 0 violations and
   * 0 configuration errors against these numbers. */
  const expected = {
    bombrun: { overlap: 3499, checkSupport: 7720, sources: 114 },
    detonation: { overlap: 3500, checkSupport: 6926, sources: 114 },
    flak: { overlap: 3516, checkSupport: 7737, sources: 118 },
    preflight: { overlap: 3467, checkSupport: 7688, sources: 107 },
    return: { overlap: 3499, checkSupport: 7719, sources: 113 },
    takeoff: { overlap: 3460, checkSupport: 7681, sources: 105 },
  };
  const states = Object.keys(expected);

  assert.equal(allowlist.$schema, 'squatchsmash.geometry-allowlist.v1');
  assert.equal(allowlist.scene, 'enolasquatch');
  assert.equal(allowlist.entries.length, states.length * 71);
  assert.deepEqual(allowlist.suppressionPolicy.map(({ state }) => state), states);
  assert.deepEqual(
    [...new Set(allowlist.entries.map(({ source }) => source))].sort(),
    [698, 775, 893, 956, 1270, 1370, 2221]
      .map((line) => 'src/enolasquatch/scenes/EnolaSquatch.js:' + line)
      .sort(),
  );

  for (const state of states) {
    const entries = allowlist.entries.filter((entry) => entry.state === state);
    assert.equal(entries.length, 71, state);
    assert.equal(entries.filter(({ kind }) => kind === 'INTERPENETRATION').length, 65, state);
    assert.equal(entries.filter(({ kind }) => kind === 'WALL_EMBED').length, 6, state);
    assert.equal(new Set(entries.map(({ id }) => id)).size, 71, state);
    for (const entry of entries) {
      assert.doesNotMatch(entry.left, /[*?\[\]]/);
      assert.doesNotMatch(entry.right, /[*?\[\]]/);
      assert.ok(entry.left.startsWith('root:enolasquatch/'));
      assert.ok(entry.right.startsWith('root:enolasquatch/'));
      assert.ok(entry.sourceAnchor.length > 20);
      assert.ok(entry.reason.length > 80);
    }

    const policy = allowlist.suppressionPolicy.find((candidate) => candidate.state === state);
    assert.equal(policy.overlap, expected[state].overlap, state);
    assert.equal(policy.checkSupport, expected[state].checkSupport, state);
    assert.equal(policy.sources.length, expected[state].sources, state);
    assert.equal(policy.sources.reduce((sum, source) => sum + source.overlap, 0), policy.overlap);
    assert.equal(
      policy.sources.reduce((sum, source) => sum + source.checkSupport, 0),
      policy.checkSupport,
    );
    assert.equal(policy.sources.filter(({ scope }) => scope === 'inherited').length, 11, state);
    assert.ok(policy.sources.every(({ sourceId }) => sourceId !== 'root:enolasquatch'));
  }
});
test('Cartel Palace approach checkpoint composes exact palm and cast assemblies', async () => {
  const built = await buildGeometrySceneState('cartel-palace:approach');
  const root = built.roots[0].root;

  assert.equal(objectsNamed(root, 'clay-tile-roof').length, 2);
  for (const name of ['clay-tile-roof', 'guardhouse-tile-roof']) {
    assert.equal(objectsNamed(root, name).every((object) => gate(object).overlap === false), true, name);
  }
  for (const name of [
    'palace-surrounding-land', 'dirt-service-road', 'courtyard-fountain',
    'courtyard-paving', 'courtyard-processional-tile', 'reflecting-pool',
    'pool-coping', 'estate-tile-floor',
  ]) {
    assert.equal(gate(onlyNamed(root, name)).structural, true, name);
    assert.equal(gate(onlyNamed(root, name)).assemblyId, `cartel-palace:structural:${name}`, name);
  }
  assert.equal(gate(onlyNamed(root, 'estate-interior-ceilings')).structural, true);
  assert.equal(objectsNamed(root, 'tire-rut').every((object) => gate(object).structural === true), true);
  for (const name of [
    'mark-office-refinement',
    'guest-suite-refinement',
    'security-room-refinement',
    'portrait-gallery-refinement',
    'final-dining-refinement',
  ]) {
    assert.equal(gate(onlyNamed(root, name)).assemblyId, `cartel-palace:${name}`, name);
  }
  const palms = objectsNamed(root, 'date-palm');
  assert.equal(palms.length, 5);
  assert.equal(palms.every((palm) => gate(palm).fixedSupportAnchor === true), true);
  assert.equal(new Set(palms.map((palm) => gate(palm).assemblyId)).size, 5);
  /* Fronds are five per-palm InstancedMesh batches now (world.js
   * `instanced()`, the batching pass) — nine fronds ride each batch. */
  assert.equal(objectsNamed(root, 'palm-frond').length, 5);
  /* THE FRONT DOOR AND THE ARCH IT HANGS IN ARE ONE INSTALLATION.
   *
   * This used to walk three names -- 'carved-arch-crown', 'carved-arch-pillar'
   * and 'estate-service-door' -- and assert each carried the portal assembly.
   * The scene pass replaced that entrance (a floating trim ring the leaf clipped
   * through) with a portal that has a real section: header, step, threshold,
   * jambs, imposts, a segmental ring, keystone, tympanum, monogram and the leaf,
   * all authored into one `estate-entrance-portal` group. The old names are
   * gone, so the annotation in tools/geometry-scenes.mjs now declares the
   * ownership on that GROUP and every part inherits it.
   *
   * The assertion follows the declaration: the group owns the assembly, and the
   * arch order and the leaf are inside the group. That is the same guarantee the
   * three names were making -- the door and the arch are one fitted object, not
   * two objects interpenetrating -- stated where it cannot rot the next time a
   * piece of stonework is renamed. */
  const entrancePortal = onlyNamed(root, 'estate-entrance-portal');
  assert.equal(gate(entrancePortal).assemblyId, 'cartel-palace:estate-service-portal');
  for (const name of [
    'estate-entry-header', 'estate-entry-jamb', 'estate-entry-impost',
    'estate-entry-arch-ring', 'estate-entry-keystone', 'estate-service-door',
  ]) {
    assert.ok(
      objectsNamed(entrancePortal, name).length >= 1,
      `${name} must be authored inside the entrance portal assembly`,
    );
  }

  const castRoots = [];
  root.traverse((object) => {
    if (gate(object).assemblyId?.startsWith('cartel-palace-cast:')) castRoots.push(object);
  });
  /* Ten, when this was written: eight guard posts plus Mark and Sauce. The
   * 2026-08-20 owner playtest pass added the `entry-watch` post -- the guard
   * seated at the computer facing the front door -- and every hard ten in
   * this file went stale at once. The roster is the pin now, so a post added
   * or retired in cast.js moves the expectation with it, while a body that
   * fails to build, or two bodies sharing one assembly id, still fails. */
  const castSize = PALACE_GUARD_POSTS.length + 2;
  assert.equal(castRoots.length, castSize);
  assert.equal(new Set(castRoots.map((object) => gate(object).assemblyId)).size, castSize);
  assert.equal(built.metadata.castCount, castSize);
  assert.equal(built.metadata.guardCount, PALACE_GUARD_POSTS.length);
  assert.equal(built.metadata.serviceGateOpen, false);
  assert.equal(built.metadata.markDown, false);
  assert.equal(built.metadata.sauceDown, false);
  assert.equal(objectsNamed(root, 'cartel-suv').length, 2);
  assert.equal(objectsNamed(root, 'cartel-suv').every((suv) => suv.position.y === 0.16), true);

  const guardhouseMesh = onlyNamed(root, 'guardhouse-shell');
  const guardhouseCollider = built.colliders.find(({ name }) => name === 'guardhouse-shell');
  assert.ok(guardhouseCollider, 'visible guardhouse must own a runtime collider');
  const guardhouseBounds = new built.THREE.Box3().setFromObject(guardhouseMesh);
  assert.deepEqual(guardhouseCollider.min.toArray(), guardhouseBounds.min.toArray());
  assert.deepEqual(guardhouseCollider.max.toArray(), guardhouseBounds.max.toArray());
  const guardhouseRoof = new built.THREE.Box3().setFromObject(onlyNamed(root, 'guardhouse-tile-roof'));
  assert.ok(Math.abs(guardhouseRoof.min.y - guardhouseBounds.max.y) < 1e-6);
  /* EVERY LIGHT IN THIS PALACE HANGS ON SOMETHING, AND NOTHING HANGS THROUGH
   * A BEAM.
   *
   * This used to count twelve `practical-suspension` rods, because twelve
   * generic `palace-ceiling-practical` bodies -- a brass cap, a bulb and a
   * drop rod -- were what every point light in the estate was given. The
   * refinement pass replaced the interior ten with authored fixtures that
   * carry their own light (pendantLantern in src/cartel-palace/world.js: the
   * entry hall's three, and one apiece for the office, security room and
   * gallery, two in the guest suite and two over the dining table), leaving
   * the generic body only where it is still right -- the exterior pair on the
   * front perimeter wall. So the rod count is two, and the twelve hanging
   * practicals are still twelve.
   *
   * The count was never the point; a light floating with no fixture under it,
   * or a fixture hung through a coffer beam, was. Both statements are made
   * over BOTH kinds of hanging practical now, and over the ROOMS rather than
   * over a total, so hanging one more lantern in the gallery does not need an
   * edit here. */
  const PENDANT_ROOMS = ['entry', 'office', 'guest-suite', 'security', 'gallery', 'dining'];
  const pendantChains = PENDANT_ROOMS.flatMap((room) => {
    const chains = objectsNamed(root, `${room}-pendant.chain`);
    assert.ok(chains.length >= 1, `${room} must hang at least one authored pendant lantern`);
    return chains;
  });
  const genericPracticals = objectsNamed(root, 'palace-ceiling-practical');
  assert.equal(objectsNamed(root, 'practical-suspension').length, genericPracticals.length);
  assert.equal(objectsNamed(root, 'practical-wall-bracket').length, genericPracticals.length);
  const hangingDrops = [...objectsNamed(root, 'practical-suspension'), ...pendantChains];
  /* Twelve is the LIGHTING PLAN, not the implementation: ten interior
   * pendants and the exterior pair. It survived the refinement pass intact
   * and is pinned here on purpose -- changing how many lights hang in Mark's
   * house is a decision, and it should have to be made in this file too. */
  assert.equal(hangingDrops.length, 12);
  assert.equal(hangingDrops.every((object) => gate(object).overlap !== false), true);
  assert.equal(objectsNamed(root, 'practical-wall-bracket').every((object) => gate(object).overlap !== false), true);
  const ceilingBeams = [
    ...objectsNamed(root, 'gallery-ceiling-beam'),
    ...objectsNamed(root, 'dining-coffer-beam'),
  ].map((object) => new built.THREE.Box3().setFromObject(object));
  for (const suspension of hangingDrops) {
    const bounds = new built.THREE.Box3().setFromObject(suspension);
    for (const beam of ceilingBeams) {
      const depth = Math.min(
        Math.min(bounds.max.x, beam.max.x) - Math.max(bounds.min.x, beam.min.x),
        Math.min(bounds.max.y, beam.max.y) - Math.max(bounds.min.y, beam.min.y),
        Math.min(bounds.max.z, beam.max.z) - Math.max(bounds.min.z, beam.min.z),
      );
      assert.ok(depth <= 0.03, 'ceiling practical suspension must occupy a clear coffer bay');
    }
  }
  const lanterns = objectsNamed(root, 'courtyard-wall-lantern');
  assert.equal(lanterns.length, 4);
  assert.equal(lanterns.every((lantern) => gate(lantern).checkSupport !== false), true);
  assert.equal(new Set(lanterns.map((lantern) => gate(lantern).assemblyId)).size, 4);
  const facade = new built.THREE.Box3().setFromObject(onlyNamed(root, 'estate-front-west'));
  for (const bracket of objectsNamed(root, 'courtyard-lantern-bracket')) {
    const bounds = new built.THREE.Box3().setFromObject(bracket);
    assert.ok(
      Math.abs(bounds.min.z - facade.max.z) <= 0.021,
      'courtyard lantern bracket must terminate at the facade instead of floating in front of it',
    );
  }
  const cypresses = objectsNamed(root, 'cypress');
  assert.equal(cypresses.length, 4);
  assert.equal(new Set(cypresses.map((cypress) => gate(cypress).assemblyId)).size, 4);
});

test('Cartel Palace clear checkpoint opens route doors, removes their colliders, and stages both targets down', async () => {
  const built = await buildGeometrySceneState('cartel-palace:clear');
  const root = built.roots[0].root;
  const serviceGate = onlyNamed(root, 'service-gate');
  const guardhouse = onlyNamed(root, 'guard-housing');

  assert.equal(serviceGate.position.x, 11.1);
  assert.equal(serviceGate.position.z, 61.9);
  assert.equal(
    new built.THREE.Box3().setFromObject(serviceGate)
      .intersectsBox(new built.THREE.Box3().setFromObject(guardhouse)),
    false,
  );
  assert.equal(built.metadata.serviceGateOpen, true);
  assert.equal(built.metadata.estateDoorOpen, true);
  assert.equal(built.metadata.diningRoomOpen, true);
  assert.equal(built.metadata.markDown, true);
  assert.equal(built.metadata.sauceDown, true);
  assert.equal(built.colliders.some(({ name }) => name === 'service-gate'), false);
  assert.equal(built.colliders.some(({ name }) => name === 'estate-service-door'), false);
  assert.equal(built.colliders.some(({ name }) => name === 'dining-room-doors'), false);
  assert.equal(built.colliders.some(({ name }) => name === 'terrace-extraction-gate'), true);
});

test('Cartel Palace policy pins only exact structural joints and direct reviewed suppressions', async () => {
  const allowlist = JSON.parse(await readFile(
    new URL('../tools/geometry-allowlists/cartel-palace.json', import.meta.url),
    'utf8',
  ));
  const states = ['approach', 'betrayal', 'clear', 'dining-room', 'estate', 'perimeter'];
  assert.equal(allowlist.entries.length, 156);
  assert.deepEqual(
    Object.fromEntries(states.map((state) => [
      state,
      allowlist.entries.filter((entry) => entry.state === state).length,
    ])),
    Object.fromEntries(states.map((state) => [state, 26])),
  );
  assert.equal(
    new Set(allowlist.entries.map(({ kind, left, right }) => `${kind}|${left}|${right}`)).size,
    26,
  );
  assert.equal(
    allowlist.entries.filter(({ left }) => left.includes('/name=practical-wall-bracket#0')).length,
    12,
  );
  for (const entry of allowlist.entries) {
    assert.match(entry.kind, /^(?:INTERPENETRATION|WALL_EMBED)$/);
    assert.doesNotMatch(entry.left, /[*?\[\]]/);
    assert.doesNotMatch(entry.right, /[*?\[\]]/);
    assert.ok(entry.left.startsWith('root:cartel-palace/'));
    assert.ok(entry.right.startsWith('root:cartel-palace/'));
  }

  assert.deepEqual(allowlist.suppressionPolicy.map(({ state }) => state), states);
  for (const policy of allowlist.suppressionPolicy) {
    assert.equal(policy.overlap, 7);
    assert.equal(policy.checkSupport, 0);
    assert.equal(policy.sources.length, 7);
    assert.ok(policy.sources.every(({ scope, sourceId }) => (
      scope === 'direct'
      && sourceId.startsWith('root:cartel-palace/')
      && sourceId !== 'root:cartel-palace'
    )));
  }
});


test('Silver Case policy pins one cramped-car contact and zero suppressions in every state', async () => {
  const allowlist = JSON.parse(await readFile(
    new URL('../tools/geometry-allowlists/silvercase.json', import.meta.url),
    'utf8',
  ));
  assert.deepEqual(allowlist.entries, [{
    id: 'silvercase-car-driver-door-card-contact',
    state: 'car',
    kind: 'INTERPENETRATION',
    left: 'root:silvercase-car/name=carInterior#0/name=person#0/name=body#0/name=arm#1/name=upperarm#0',
    right: 'root:silvercase-car/name=carInterior#0/type=Mesh#33',
    maxDepthM: 0.056,
    reason: "Ape's authored both-hands-on-wheel pose leaves his outside upper arm compressed 5.5 cm into the padded driver-side door card in the intentionally cramped cabin.",
    source: 'src/silvercase/scenes/CarInterior.js:324',
    sourceAnchor: 'root.add(box({ size: [0.09, 0.055, 0.5]',
  }]);
  assert.deepEqual(
    allowlist.suppressionPolicy.map(({ state }) => state),
    ['aftermath', 'bathroom', 'car', 'hallway', 'prayer', 'room'],
  );
  assert.equal(allowlist.suppressionPolicy.every((policy) => (
    policy.overlap === 0 && policy.checkSupport === 0 && policy.sources.length === 0
  )), true);
});

test('Squatchfather policy limits opt-outs to five cloth skirts and two wall-set panes', async () => {
  const built = await buildGeometrySceneState('squatchfather:default');
  const root = built.roots[0].root;
  const skirts = objectsNamed(root, 'squatchfather.table.cloth-skirt');
  assert.equal(skirts.length, 5);
  assert.equal(skirts.every((skirt) => (
    gate(skirt).overlap === false && gate(skirt).checkSupport === undefined
  )), true);
  const panes = objectsNamed(root, 'squatchfather.restaurant.window-glass');
  assert.equal(panes.length, 2);
  assert.equal(panes.every((pane) => (
    gate(pane).overlap === undefined && gate(pane).checkSupport === false
  )), true);

  const allowlist = JSON.parse(await readFile(
    new URL('../tools/geometry-allowlists/squatchfather.json', import.meta.url),
    'utf8',
  ));
  assert.deepEqual(allowlist.entries.map((entry) => ({
    id: entry.id,
    state: entry.state,
    kind: entry.kind,
    left: entry.left,
    right: entry.right,
    maxDepthM: entry.maxDepthM,
    source: entry.source,
    sourceAnchor: entry.sourceAnchor,
  })), [{
    id: 'squatchfather-default-diner2-hand-table-contact',
    state: 'default',
    kind: 'INTERPENETRATION',
    left: 'root:squatchfather-runtime/name=squatchfather-diner2#0/name=sf.root#0/name=sf.pelvis#0/name=sf.torso#0/name=sf.arm.left.shoulder#0/name=sf.arm.left.elbow#0/name=sf.arm.left.hand#0',
    right: 'root:squatchfather-runtime/name=squatchfather.table.30#0/name=squatchfather.table.top#0',
    maxDepthM: 0.045,
    source: 'src/squatchfather/scenes/SquatchfatherScene.js:1370',
    sourceAnchor: 'const diner2Fig = makeFigure(5.71, 1.77',
  }]);
  assert.deepEqual(allowlist.suppressionPolicy, [{
    state: 'default',
    overlap: 5,
    checkSupport: 2,
    sources: [
      { sourceId: 'root:squatchfather-runtime/name=squatchfather.restaurant-shell#0/name=squatchfather.window.13#0/name=squatchfather.restaurant.window-glass#0', scope: 'direct', overlap: 0, checkSupport: 1 },
      { sourceId: 'root:squatchfather-runtime/name=squatchfather.restaurant-shell#0/name=squatchfather.window.14#0/name=squatchfather.restaurant.window-glass#0', scope: 'direct', overlap: 0, checkSupport: 1 },
      { sourceId: 'root:squatchfather-runtime/name=squatchfather.table.16#0/name=squatchfather.table.cloth-skirt#0', scope: 'direct', overlap: 1, checkSupport: 0 },
      { sourceId: 'root:squatchfather-runtime/name=squatchfather.table.26#0/name=squatchfather.table.cloth-skirt#0', scope: 'direct', overlap: 1, checkSupport: 0 },
      { sourceId: 'root:squatchfather-runtime/name=squatchfather.table.30#0/name=squatchfather.table.cloth-skirt#0', scope: 'direct', overlap: 1, checkSupport: 0 },
      { sourceId: 'root:squatchfather-runtime/name=squatchfather.table.34#0/name=squatchfather.table.cloth-skirt#0', scope: 'direct', overlap: 1, checkSupport: 0 },
      { sourceId: 'root:squatchfather-runtime/name=squatchfather.table.38#0/name=squatchfather.table.cloth-skirt#0', scope: 'direct', overlap: 1, checkSupport: 0 },
    ],
  }]);
});