import test from 'node:test';
import assert from 'node:assert/strict';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const [
  {
    GEOMETRY_ACTOR_EXPECTATION_DISPOSITIONS,
    GEOMETRY_FROZEN_WAIVERS,
    GEOMETRY_SCENE_STATES,
    buildGeometrySceneState,
    geometryLauncherCoverage,
    geometrySceneState,
  },
  { SCENE_AUDIT_SCENES },
  { APARTMENT_PREVIEW_VARIANTS },
  { DAMAGE_STATES },
  { PALACE_GUARD_POSTS, PALACE_WAVE_POSTS },
] = await Promise.all([
  import('../tools/geometry-scenes.mjs'),
  import('../tools/scene-audit-scenes.mjs'),
  import('../src/core/preview-mode.js'),
  import('../src/mansion/siege/state.js'),
  import('../src/cartel-palace/cast.js'),
]);

const EXPECTED_ADAPTERS = Object.freeze([
  'apartment',
  'beefrun',
  'bing',
  'bing-party',
  'cabin',
  'cartel-palace',
  'enolasquatch',
  'golf',
  'graveyard',
  'heist',
  'initiation',
  'luxury-apartment',
  'mansion',
  'mansion-siege',
  'motel',
  'nowake',
  'silent-squatch',
  'silver',
  'silvercase-apartment',
  'silvercase-car',
  'specialmeeting-kerb',
  'specialmeeting-spur',
  'squatchfather',
]);

function statesFor(scene, adapter = null) {
  return GEOMETRY_SCENE_STATES.filter((descriptor) => (
    descriptor.scene === scene && (adapter === null || descriptor.adapter === adapter)
  ));
}

function assertPlainData(value, path = 'value') {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return;
  assert.notEqual(typeof value, 'function', `${path} must not contain functions`);
  assert.notEqual(typeof value, 'undefined', `${path} must not contain undefined`);

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertPlainData(item, `${path}[${index}]`));
    return;
  }

  assert.equal(
    Object.getPrototypeOf(value),
    Object.prototype,
    `${path} must contain only plain objects, arrays, and primitives`,
  );
  for (const [key, item] of Object.entries(value)) assertPlainData(item, `${path}.${key}`);
}

test('geometry scene registry has unique, resolvable IDs and plain metadata', () => {
  const ids = GEOMETRY_SCENE_STATES.map(({ id }) => id);
  assert.equal(new Set(ids).size, ids.length, 'geometry scene state IDs must be unique');

  for (const descriptor of GEOMETRY_SCENE_STATES) {
    assert.equal(descriptor.id, `${descriptor.scene}:${descriptor.state}`);
    assert.strictEqual(geometrySceneState(descriptor.id), descriptor);
    assertPlainData(descriptor, descriptor.id);
  }
  assert.equal(geometrySceneState('not-a-real-scene:missing'), null);

  for (const waiver of GEOMETRY_FROZEN_WAIVERS) {
    assertPlainData(waiver, `waiver:${waiver.launcherId}`);
  }
});

test('every geometry state declares whether visible cast is required or intentionally absent', () => {
  const dispositions = new Set(Object.values(GEOMETRY_ACTOR_EXPECTATION_DISPOSITIONS));
  for (const descriptor of GEOMETRY_SCENE_STATES) {
    const expectation = descriptor.actorExpectation;
    assert.ok(expectation && typeof expectation === 'object', `${descriptor.id} has no actor contract`);
    assert.ok(
      dispositions.has(expectation.disposition),
      `${descriptor.id} has unknown actor disposition ${expectation.disposition}`,
    );
    assert.ok(
      typeof expectation.reason === 'string' && expectation.reason.trim(),
      `${descriptor.id} actor contract needs a reason`,
    );
    if (expectation.disposition === GEOMETRY_ACTOR_EXPECTATION_DISPOSITIONS.REQUIRED) {
      assert.ok(Number.isInteger(expectation.minimum) && expectation.minimum > 0);
    } else {
      assert.equal(expectation.minimum, 0);
    }
  }

  assert.deepEqual(
    GEOMETRY_SCENE_STATES
      .filter(({ actorExpectation }) => (
        actorExpectation.disposition === GEOMETRY_ACTOR_EXPECTATION_DISPOSITIONS.INTENTIONAL_NA
      ))
      .map(({ id }) => id)
      .toSorted(),
    [
      'apartment:after-beef-run',
      'apartment:after-bing-one',
      'apartment:after-golf',
      'apartment:after-heist',
      'apartment:after-motel',
      'apartment:after-no-wake',
      'apartment:after-squatchfather',
      'apartment:day-one-wake',
      'apartment:day-three-wake',
      'apartment:day-two-wake',
      'mansion-siege:alert',
      'mansion-siege:clean',
      'mansion-siege:repaired',
      'motel:drive',
    ],
    'no-cast certification must be a reviewed state list, not the default',
  );
});

test('geometry registry contains every canonical apartment preview variant', () => {
  const apartments = statesFor('apartment');
  assert.deepEqual(apartments.map(({ state }) => state), [...APARTMENT_PREVIEW_VARIANTS]);
  assert.deepEqual(
    apartments.map(({ state, launcherIds }) => ({ state, launcherIds })),
    APARTMENT_PREVIEW_VARIANTS.map((variant) => ({
      state: variant,
      launcherIds: [`apartment:${variant}`],
    })),
  );
});

test('geometry registry covers every browser-audit launcher, and waives nothing', () => {
  const coverage = geometryLauncherCoverage();
  const auditLauncherIds = SCENE_AUDIT_SCENES.map(({ id }) => id);

  for (const launcherId of auditLauncherIds) {
    const coveredStates = coverage.get(launcherId);
    assert.ok(coveredStates?.length > 0, `${launcherId} has no headless geometry state`);
    assert.ok(
      coveredStates.every((stateId) => !stateId.startsWith('waiver:')),
      `${launcherId} must be covered by a buildable state, not a waiver`,
    );
  }

  /* Nothing is waived, and this is the assertion that keeps it that way.
   *
   * Initiation was the last entry, on the grounds that it had "no extractable
   * headless builder". That was true of the old scene, whose geometry was
   * interleaved with top-level WebGL boot code, and it stopped being true the
   * day the cabin ceremony was written -- `buildInitiationCabinSite()` needs
   * neither a page nor a renderer. The waiver outlived its reason by the
   * length of a rewrite, and nothing re-read it, because a frozen waiver is
   * the one kind of gate entry that never fails.
   *
   * A new one is a decision somebody has to make in a diff, against this line. */
  assert.deepEqual(GEOMETRY_FROZEN_WAIVERS, []);
  assert.deepEqual(
    coverage.get('initiation'),
    ['initiation:cabin', 'initiation:clearing'],
  );
  assert.deepEqual(
    [...coverage.keys()].sort(),
    [...auditLauncherIds, 'initiation'].sort(),
    'the headless gate must neither omit nor invent public scene launchers',
  );
  /* The inverse of what this line used to say. It read "frozen Initiation must
   * not be imported through a geometry Adapter", which was the freeze
   * defending itself: while it held, the scene could not be audited, and while
   * it could not be audited nothing could show the freeze was no longer
   * needed. It is imported, it builds, and it passes. */
  assert.equal(
    GEOMETRY_SCENE_STATES.some(({ launcherIds }) => launcherIds.includes('initiation')),
    true,
    'Initiation is in the gate and must stay there',
  );
});

test('multi-state scenes enumerate every authored geometry state', () => {
  const heist = statesFor('heist');
  assert.deepEqual(heist.map(({ state }) => state), [
    'safehouse',
    'bank-lobby',
    'vault-open',
    'street-withdrawal',
    'mercer-garage',
    'vehicle-escape',
    'safehouse-debrief',
  ]);
  assert.deepEqual(heist.map(({ checkpoint }) => checkpoint), [
    'safehouse',
    'bank_lobby',
    'vault_open',
    'street_withdrawal',
    'mercer_garage',
    'vehicle_escape',
    'safehouse_debrief',
  ]);

  const golf = statesFor('golf');
  assert.deepEqual(golf.map(({ state }) => state), ['hole-one', 'hole-two', 'hole-three', 'grille']);
  assert.deepEqual(golf.map(({ hole }) => hole), [1, 2, 3, 3]);
  assert.deepEqual(golf.map(({ checkpoint }) => checkpoint), ['hole1', 'hole2', 'hole3', 'grille']);

  assert.deepEqual(
    statesFor('silvercase').map(({ state }) => state),
    ['car', 'hallway', 'room', 'prayer', 'bathroom', 'aftermath'],
  );
  assert.deepEqual(
    statesFor('silvercase').map(({ checkpoint }) => checkpoint),
    ['car', 'hallway', 'room', 'prayer', 'bathroom', 'aftermath'],
  );

  const silent = statesFor('mansion', 'silent-squatch');
  assert.deepEqual(silent.map(({ state }) => state), ['silent-closed', 'silent-open']);
  assert.equal(silent[0].open, undefined);
  assert.equal(silent[1].open, true);

  const mansionCheckpoints = statesFor('mansion', 'mansion').filter(({ checkpoint }) => checkpoint);
  assert.deepEqual(
    mansionCheckpoints.map(({ checkpoint }) => checkpoint),
    [
      'arrival', 'office', 'basement', 'lab', 'core_complete',
      'locked', 'aubbie_down', 'silent_night', 'clear', 'suite',
    ],
  );

  const expectedSiegeStates = DAMAGE_STATES.map((state) => state.replaceAll('_', '-'));
  const siege = statesFor('mansion-siege');
  const siegeDamageStates = siege.filter(({ checkpoint }) => !checkpoint);
  assert.deepEqual(siegeDamageStates.map(({ state }) => state), expectedSiegeStates);
  assert.deepEqual(siegeDamageStates.map(({ damageState }) => damageState), [...DAMAGE_STATES]);
  assert.deepEqual(
    siege.filter(({ checkpoint }) => checkpoint).map(({ checkpoint }) => checkpoint),
    ['wake', 'armed', 'briefed', 'wave_one'],
  );

  const noWake = statesFor('nowake');
  assert.deepEqual(
    noWake.filter(({ checkpoint }) => checkpoint).map(({ state, checkpoint }) => ({ state, checkpoint })),
    ['dock', 'underway', 'inlet', 'confrontation', 'body', 'return']
      .map((checkpoint) => ({ state: checkpoint, checkpoint })),
  );
  assert.deepEqual(
    noWake.filter(({ geometryStage }) => geometryStage).map(({ state, geometryStage, checkpoint }) => ({
      state, geometryStage, checkpoint,
    })),
    [{ state: 'weighted', geometryStage: 'weighted', checkpoint: undefined }],
  );

  const enola = statesFor('enolasquatch');
  assert.deepEqual(
    enola.map(({ state, checkpoint }) => ({ state, checkpoint })),
    ['preflight', 'takeoff', 'flak', 'bombrun', 'detonation', 'return']
      .map((checkpoint) => ({ state: checkpoint, checkpoint })),
  );

  const palace = statesFor('cartel-palace');
  assert.deepEqual(
    palace.map(({ state, checkpoint }) => ({ state, checkpoint })),
    [
      ['approach', 'approach'],
      ['perimeter', 'perimeter'],
      ['estate', 'estate'],
      ['betrayal', 'betrayal'],
      ['dining-room', 'dining_room'],
      ['clear', 'clear'],
    ].map(([state, checkpoint]) => ({ state, checkpoint })),
  );
});

test('every registered Adapter name is known', () => {
  const adapters = [...new Set(GEOMETRY_SCENE_STATES.map(({ adapter }) => adapter))].sort();
  assert.deepEqual(adapters, [...EXPECTED_ADAPTERS]);
});

test('luxury apartment Adapter publishes the complete property and authored metrics', async () => {
  const built = await buildGeometrySceneState('luxury-apartment:property');
  assert.equal(built.roots.length, 1);
  assert.equal(built.roots[0].label, 'luxury-apartment-property');
  assert.equal(built.roots[0].root.name, 'luxury-apartment');
  assert.ok(built.colliders.length > 0, 'luxury apartment Adapter publishes no collision layer');
  assert.equal(built.metadata.metrics.floors, 2);
  assert.equal(built.metadata.metrics.stairSteps, 18);
  assert.ok(built.metadata.metrics.panoramicWindowArea > 0);
  assert.ok(built.metadata.metrics.artSlots > built.metadata.metrics.originalArtSlots);
  assertPlainData(built.metadata, 'luxury-apartment:property.metadata');
});


test('every Mansion Adapter state mounts the complete cast and Snow cart collider', async () => {
  for (const state of ['tour', 'return', 'silent-closed', 'silent-open']) {
    const built = await buildGeometrySceneState(`mansion:${state}`);
    const cast = built.metadata.mansionCast;
    assert.equal(built.metadata.silent?.hasLab, true, `${state} omits the always-mounted lab`);
    assert.equal(built.metadata.armory?.rackCount, 7, `${state} omits an armory rack`);
    assert.equal(built.metadata.armory?.colliderCount, 7, `${state} omits an armory collider`);
    for (const id of built.metadata.armory.rackIds) {
      const rack = built.roots[0].root.getObjectByName(`mansion-armory-rack-${id}`);
      assert.equal(
        rack?.userData.geometryGate?.assemblyId,
        `mansion-armory-rack:${id}`,
        `${state} does not own the ${id} rack as one fixture`,
      );
      const rackColliders = built.colliders.filter(({ name }) => (
        name === `mansion-armory-rack-${id}-collider`
      ));
      assert.equal(rackColliders.length, 1, `${state} omits or duplicates the ${id} rack collider`);
      assert.equal(rackColliders[0].userData.geometryGate?.assemblyId, `mansion-armory-rack:${id}`);
    }
    assert.ok(cast, `${state} publishes no Mansion cast evidence`);
    assert.equal(cast.visit, state === 'return' ? 'return' : 'mission');
    assert.ok(cast.roster.includes('snow'), `${state} omits Snow`);
    assert.ok(cast.roster.includes('lou'), `${state} omits Big Uncle Lou`);
    assert.equal(cast.saucePresent, state !== 'return', `${state} has the wrong Sauce continuity state`);
    assert.equal(cast.colliderCount, 1, `${state} does not mount Snow's one cart collider`);
    assert.equal(cast.rootCount, cast.roster.length + 2, `${state} has unclassified cast roots`);
    for (const id of cast.roster) {
      const root = built.roots[0].root.getObjectByName(`mansion-cast-${id}`);
      const expectedOwner = cast.fixtureBindings[id] ?? `mansion-cast:${id}`;
      assert.equal(root?.userData.geometryGate?.assemblyId, expectedOwner,
        `${state} does not give ${id} a stable logical owner`);
    }
    const cart = built.roots[0].root.getObjectByName('mansion-snow-cart');
    const dog = built.roots[0].root.getObjectByName('lil-tom-cruze');
    assert.equal(cart?.userData.geometryGate?.assemblyId, 'mansion-cast:snow-cart');
    assert.equal(dog?.userData.geometryGate?.assemblyId, 'mansion-suite-dog-cushion');
    const THREE = built.THREE;
    const boothGuard = built.roots[0].root.getObjectByName('mansion-cast-booth');
    const boothChair = built.roots[0].root.getObjectByName('booth-chair');
    assert.equal(
      new THREE.Box3().setFromObject(boothGuard).intersectsBox(new THREE.Box3().setFromObject(boothChair)),
      false,
      `${state} puts the booth guard inside his unused chair`,
    );
    const lag = built.roots[0].root.getObjectByName('mansion-cast-lag');
    const lagBox = new THREE.Box3().setFromObject(lag);
    const desks = [];
    built.roots[0].root.traverse((object) => { if (object.name === 'desk') desks.push(object); });
    assert.ok(desks.every((desk) => !lagBox.intersectsBox(new THREE.Box3().setFromObject(desk))),
      `${state} puts Lag inside a LAN desk`);
    assert.equal(
      built.roots[0].root.getObjectByName('mansion-cast-patrol0')?.position.y,
      0.05,
      `${state} buries the driveway patrol in the raised pavers`,
    );
    assert.equal(
      built.roots[0].root.getObjectByName('mansion-cast-poolPerformer2')
        ?.userData.geometryGate?.checkSupport,
      false,
      `${state} treats the performer treading water as floor-supported`,
    );
    const cartCollider = built.colliders.filter(({ name }) => name === 'mansion-snow-cart-collider');
    assert.equal(cartCollider.length, 1, `${state} omits or duplicates Snow's cart collider`);
    assert.equal(cartCollider[0].userData.geometryGate?.assemblyId, 'mansion-cast:snow-cart');
    if (state.startsWith('silent-')) {
      assert.ok(['irish', 'booski', 'deathmegatron', 'gratin'].every((id) => cast.roster.includes(id)),
        `${state} omits lab-specific cast members`);
    }
    assertPlainData(built.metadata, `mansion:${state}.metadata`);
  }
});

test('public Mansion and Siege checkpoints build their exact runtime geometry state', async () => {
  const mansionCheckpoints = [
    'arrival', 'office', 'basement', 'lab', 'core_complete',
    'locked', 'aubbie_down', 'silent_night', 'clear', 'suite',
  ];
  for (const checkpoint of mansionCheckpoints) {
    const state = `checkpoint-${checkpoint.replaceAll('_', '-')}`;
    const built = await buildGeometrySceneState(`mansion:${state}`);
    assert.equal(built.metadata.mission.checkpoint, checkpoint);
    assert.equal(built.metadata.mission.mounted, true);
    assert.equal(built.metadata.silent.hasLab, true);
    assert.equal(built.metadata.armory.rackCount, 7);
    assert.ok(built.metadata.mansionCast.roster.includes('snow'));
    assert.equal(
      built.colliders.filter(({ name }) => name === 'mansion-snow-cart-collider').length,
      1,
    );
    assertPlainData(built.metadata, `mansion:${state}.metadata`);
  }

  const siegeCheckpoints = new Map([
    ['wake', { beat: 'WAKE', built: 2, active: 2, staged: 0 }],
    ['armed', { beat: 'TO_OFFICE', built: 5, active: 5, staged: 15 }],
    ['briefed', { beat: 'LITTLE_FRIEND', built: 5, active: 5, staged: 15 }],
    ['wave_one', { beat: 'LULL', built: 13, active: 0, staged: 15 }],
  ]);
  for (const [checkpoint, expected] of siegeCheckpoints) {
    const state = `checkpoint-${checkpoint.replaceAll('_', '-')}`;
    const built = await buildGeometrySceneState(`mansion-siege:${state}`);
    assert.equal(built.metadata.checkpoint, checkpoint);
    assert.equal(built.metadata.missionBeat, expected.beat);
    assert.equal(built.metadata.ensemble.memberCount, 16);
    assert.equal(
      Object.keys(built.metadata.ensemble.settledPosts).length,
      expected.staged,
    );
    assert.equal(built.metadata.armory.rackCount, 7);
    assert.equal(built.metadata.attackers.builtCount, expected.built);
    assert.equal(built.metadata.attackers.activeCount, expected.active);
    for (const [id, post] of Object.entries(built.metadata.ensemble.settledPosts)) {
      const actor = built.roots[0].root.getObjectByName(`mansion-siege-ensemble-${id}`);
      assert.ok(actor?.visible, `${state} does not show staged ensemble member ${id}`);
      assert.deepEqual(actor.position.toArray(), [post.x, post.y, post.z],
        `${state} leaves ${id} walking from the preceding checkpoint`);
    }
    for (const id of built.metadata.attackers.ids) {
      const actor = built.roots[0].root.getObjectByName(`mansion-siege-attacker-${id}`);
      assert.equal(
        actor?.userData.geometryGate?.assemblyId,
        `mansion-siege-attacker:${id}`,
      );
    }
    assertPlainData(built.metadata, `mansion-siege:${state}.metadata`);
  }
});
test('Cartel Palace approach smoke-build produces the world, cast, and colliders', async () => {
  const built = await buildGeometrySceneState('cartel-palace:approach');
  let meshCount = 0;
  for (const { root } of built.roots) {
    root.traverse((object) => {
      if (object.isMesh) meshCount += 1;
    });
  }

  assert.equal(built.id, 'cartel-palace:approach');
  assert.equal(built.scene, 'cartel-palace');
  assert.equal(built.state, 'approach');
  assert.ok(meshCount > 0, 'Cartel Palace approach built no traversable meshes');
  assert.ok(built.colliders.length > 0, 'Cartel Palace approach built no colliders');
  /* These used to read `castCount === 10` and `guardCount === 8`, which was
   * the roster on the day they were written. The 2026-08-20 owner playtest
   * pass added the `entry-watch` post -- the guard seated at the computer
   * facing the front door -- and both numbers went stale at once, failing a
   * palace that had gained a man rather than lost one.
   *
   * Pinned to the authored rosters instead of to a number: every post in
   * PALACE_GUARD_POSTS must have become a body, and the combat cast is that
   * roster, plus the two named targets, plus the reprisal wave Mark calls when
   * his plates come off (PALACE_WAVE_POSTS, added 2026-08-25 -- built at boot
   * and parked inactive, because everything that makes a Combatant work is
   * constructed once from `all`). A post added or removed in cast.js moves
   * both sides together; a post that silently fails to build, or a target that
   * goes missing, still fails here. */
  assert.equal(built.metadata.guardCount, PALACE_GUARD_POSTS.length);
  assert.equal(
    built.metadata.castCount,
    PALACE_GUARD_POSTS.length + 2 + PALACE_WAVE_POSTS.length,
  );
  assertPlainData(built.metadata, 'cartel-palace:approach.metadata');
});
