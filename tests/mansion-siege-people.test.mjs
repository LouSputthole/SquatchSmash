/**
 * THE PEOPLE IN THE SIEGE.
 *
 * `tests/mansion-siege.test.mjs` covers the state layer, the wave structure
 * and the mission model -- the headless data. This file covers the two
 * modules that put bodies in the house: `src/mansion/siege/attackers.js` and
 * `src/mansion/siege/ensemble.js`.
 *
 * WHAT IS TESTED IS WHAT ACTUALLY BREAKS. Not "the module exports a
 * function": the five things that end a playthrough badly.
 *
 *   1. A cartel round cannot damage Snow, and no cartel gun is ever pointed
 *      at him in the first place.
 *   2. An attacker activates in his staging zone, not in the foyer under the
 *      player's feet.
 *   3. `onDown` fires exactly ONCE per attacker, whoever killed him -- the
 *      wave director counts these, and a miscount either clears a wave with
 *      four men still standing or strands one that is empty.
 *   4. The snapshot/restore pair does not resurrect anybody and does not
 *      report a death twice.
 *   5. No role shares the whole behaviour of another, because "they have
 *      different health values" is not the same sentence as "twenty-two
 *      identical riflemen is not an encounter".
 *
 * These modules build THREE objects, so this file needs the vendored three
 * that `tests/run.mjs` shims in before it imports anything. Running this file
 * on its own wants `node --test` after a `npm test`, or the shim call below.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { ensureThreeShim, ensureDomShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const THREE = await import('three');
const { CombatActor } = await import('../src/core/combat/actors.js');
const { FACTIONS, FactionMatrix } = await import('../src/core/combat/factions.js');
const { WEAPON_CATALOG } = await import('../src/core/weapons/catalog.js');
const { MansionDamageState } = await import('../src/mansion/siege/state.js');
const { BIG_UNCLE_LOU_MANSION } = await import('../src/core/wardrobe.js');
const { BLOOD_POOL_NAME, DeathBloodPool } = await import('../src/world/blood.js');
const { mountArmory } = await import('../src/core/weapons/Armory.js');
const { buildMansionGrounds } = await import('../src/mansion/scenes/MansionGrounds.js');
const { buildMansionInterior } = await import('../src/mansion/scenes/MansionInterior.js');
const { buildSiegeDressing } = await import('../src/mansion/siege/dressing.js');
const { buildSiegeGlass } = await import('../src/mansion/siege/glass.js');
const siegeNight = await import('../src/mansion/siege/night.js');
const {
  diagnoseWorklampComposition, evaluateWorklampComposition,
  isEvidenceBodyMesh, isEvidenceOpaqueIntersection,
  selectEvidenceTextureSamples,
} = await import('../tools/mansion-siege-evidence-contract.mjs');
const {
  COMBAT_BOUNDARY, ENCOUNTERS, ROLES, STAGING, WaveDirector,
} = await import('../src/mansion/siege/waves.js');
const {
  ANCHORS, GROUND_Y, OPENINGS, ROOMS, SiegeNavigator,
  anchorById, crossingFor, laneWaypoints, roomAt,
} = await import('../src/mansion/siege/nav.js');
const {
  createAttackerPool, groundHeightAt, segmentBlocked, HIT_ZONES, HUNT_SPEED, ROLE_PLAN,
} = await import('../src/mansion/siege/attackers.js');
const {
  buildSiegeEnsemble, KEEP_CLEAR, HOUSE_BOUNDS, KILL_BUDGET, SURVIVES_THE_SIEGE,
} = await import('../src/mansion/siege/ensemble.js');

/* ================================================================== */
/* Harness                                                              */
/* ================================================================== */

function harness({ state = 'under_attack' } = {}) {
  const scene = new THREE.Scene();
  const colliders = [];
  const damage = new MansionDamageState({ colliders, state });
  const matrix = new FactionMatrix();
  const downs = [];
  const pool = createAttackerPool({
    scene, damage, matrix, onDown: (id) => downs.push(id),
  });
  return { scene, colliders, damage, matrix, pool, downs };
}

function makePlayer(x = 0, y = 7.66, z = 46.5) {
  return {
    position: new THREE.Vector3(x, y, z),
    actor: new CombatActor({ id: 'prospect', faction: FACTIONS.CREW, maxHealth: 100 }),
    suppression: { misses: 0, noteNearMiss() { this.misses++; return 1; } },
  };
}

/** Release a whole wave at once, so a test does not have to wait a clock. */
function releaseWave(pool, id) {
  const director = new WaveDirector({ wave: id });
  const orders = [...director.begin()];
  for (let i = 0; i < 6; i++) orders.push(...director.update(30));
  for (const order of orders) pool.spawn(order);
  return orders;
}

function run(pool, ensemble, seconds, ctx) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) {
    pool.update(1 / 60, ctx.attackerCtx());
    ensemble?.update(1 / 60, ctx.ensembleCtx());
    ctx.after?.();
  }
}

function authoredWorklampEvidenceView() {
  const source = fs.readFileSync(
    new URL('../tools/shots-mansion-siege.mjs', import.meta.url), 'utf8',
  );
  const match = source.match(
    /id:\s*'worklamp-eric-flinch',\s*x:\s*([-\d.]+),\s*y:\s*([-\d.]+),\s*z:\s*([-\d.]+),\s*target:\s*\[\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\s*\],\s*crouch:\s*true/,
  );
  assert.ok(match, 'the crouched worklamp evidence camera is not statically auditable');
  const [, x, y, z, targetX, targetY, targetZ] = match.map(Number);
  return { source, x, y, z, targetX, targetY, targetZ };
}

function renderedBodyBox(entry) {
  const box = new THREE.Box3();
  entry.root.updateMatrixWorld(true);
  entry.root.traverse((object) => {
    if (object.visible && isEvidenceBodyMesh(object, entry.root, entry.gun)) {
      box.union(new THREE.Box3().setFromObject(object));
    }
  });
  return box;
}

/**
 * The union AABB above is useful for support, but it is not a collision
 * shape.  A rotated arm and leg can leave empty space between their boxes;
 * treating that empty space as body made the route audit reject walls the
 * rendered rig never touched.  Keep the same real rendered-mesh predicate,
 * but retain one world box per mesh for the collision broad phase.
 */
function renderedBodyMeshBoxes(entry) {
  const parts = [];
  entry.root.updateMatrixWorld(true);
  entry.root.traverse((object) => {
    if (!object.visible || !isEvidenceBodyMesh(object, entry.root, entry.gun)) return;
    const box = new THREE.Box3().setFromObject(object);
    if (!box.isEmpty()) parts.push({ name: object.name || object.type, box });
  });
  return parts;
}

function captureWeaponMount(entry) {
  return {
    parent: entry.gun.parent,
    index: entry.gun.parent?.children.indexOf(entry.gun) ?? -1,
    position: entry.gun.position.toArray(),
    quaternion: entry.gun.quaternion.toArray(),
    scale: entry.gun.scale.toArray(),
  };
}

function assertWeaponMount(entry, mount, label) {
  assert.equal(entry.gun.parent, mount.parent, `${label} changed weapon parent`);
  assert.equal(entry.gun.parent?.children.indexOf(entry.gun), mount.index,
    `${label} changed weapon child index`);
  assert.deepEqual(entry.gun.position.toArray(), mount.position, `${label} changed weapon position`);
  assert.deepEqual(entry.gun.quaternion.toArray(), mount.quaternion, `${label} changed weapon rotation`);
  assert.deepEqual(entry.gun.scale.toArray(), mount.scale, `${label} changed weapon scale`);
}

function firstVisibleSupport(scene, excludedRoot, x, y, z, { walkableOnly = false } = {}) {
  const meshes = [];
  scene.updateMatrixWorld(true);
  scene.traverse((object) => {
    if (!object.isMesh || !object.visible) return;
    if (walkableOnly && object.userData?.siegeWalkableSupport !== true) return;
    for (let node = object; node; node = node.parent) {
      if (node === excludedRoot) return;
    }
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (!materials.some((material) => material?.visible !== false
        && (material?.transparent !== true || material.opacity > 0.001))) return;
    meshes.push(object);
  });
  const ray = new THREE.Raycaster(
    new THREE.Vector3(x, y + 0.3, z), new THREE.Vector3(0, -1, 0), 0, 1,
  );
  const normal = new THREE.Vector3();
  return ray.intersectObjects(meshes, false).find((hit) => {
    if (hit.point.y > y + 0.205 || hit.point.y < y - 0.5) return false;
    if (!hit.face) return false;
    normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
    return normal.y >= 0.75;
  }) ?? null;
}

function highestWalkableSupport(scene, excludedRoot, x, z, ceilingY = 2.2) {
  const meshes = [];
  scene.updateMatrixWorld(true);
  scene.traverse((object) => {
    if (!object.isMesh || !object.visible
        || object.userData?.siegeWalkableSupport !== true) return;
    for (let node = object; node; node = node.parent) if (node === excludedRoot) return;
    meshes.push(object);
  });
  const ray = new THREE.Raycaster(
    new THREE.Vector3(x, ceilingY, z), new THREE.Vector3(0, -1, 0), 0, 5,
  );
  const normal = new THREE.Vector3();
  return ray.intersectObjects(meshes, false).find((hit) => {
    if (!hit.face) return false;
    normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
    return normal.y >= 0.75;
  }) ?? null;
}

/** Match the live Mansion/Siege floor contract: the highest authored interior
 * surface gets first refusal, then the exact front-entry boxes, then grade. */
function mansionGroundAt(grounds, interior) {
  return (x, z, y) => interior.floorAt(x, z, y)
    ?? grounds.props.siegeBreachGroundAt(x, z)
    ?? grounds.props.frontEntry.groundAt(x, z)
    ?? 0;
}

/* ================================================================== */
/* 1. SNOW                                                              */
/* ================================================================== */

test('a cartel round cannot damage Snow', () => {
  const { scene, damage, matrix } = harness();
  const ensemble = buildSiegeEnsemble({ scene, damage, matrix });
  const snow = ensemble.members.get('snow');
  assert.ok(snow, 'Snow is in the ensemble');
  /* Lock one: the shared core's own protection, not a siege special case. */
  assert.equal(snow.actor.core, true);
  const result = snow.actor.applyHit({
    amount: 9999, attacker: { faction: FACTIONS.CARTEL }, matrix,
  });
  assert.equal(result.protectedCore, true);
  assert.equal(snow.actor.incapacitated, false);
  assert.equal(snow.actor.health, 1);
});

test('Snow is never in the list the cartel is handed', () => {
  const { scene, damage, matrix } = harness();
  const ensemble = buildSiegeEnsemble({ scene, damage, matrix });
  ensemble.stage('WAVE_ONE');
  const ids = ensemble.targets().map((root) => root.userData.memberId);
  assert.ok(ids.length > 6, 'the rest of the family IS targetable');
  assert.equal(ids.includes('snow'), false);
  /* And the flag the attacker pool reads before it consults the matrix. */
  assert.equal(ensemble.members.get('snow').root.userData.neverTargeted, true);
});

test('an attacker handed Snow anyway refuses to take him as a target', () => {
  /* The belt and the braces tested together: even if the scene passes the
   * whole ensemble including Snow -- which `targets()` will not do -- the
   * pool must still not aim at him. */
  const { scene, colliders, damage, matrix, pool } = harness();
  const ensemble = buildSiegeEnsemble({ scene, damage, matrix });
  ensemble.stage('WAVE_ONE');
  releaseWave(pool, 'one');
  const snow = ensemble.members.get('snow');
  const everybody = [...ensemble.members.values()]
    .filter((member) => member.root.visible)
    .map((member) => member.root);
  assert.ok(everybody.some((root) => root.userData.memberId === 'snow'),
    'the deliberately careless list DOES contain him');
  const player = makePlayer();
  for (let i = 0; i < 900; i++) {
    pool.update(1 / 60, { player, colliders, alive: everybody });
    for (const entry of pool.all()) {
      assert.notEqual(entry.target?.node, snow.root,
        `${entry.id} took Snow as a target`);
    }
  }
  assert.equal(snow.actor.health, snow.actor.maxHealth, 'and never touched him');
});

/* ================================================================== */
/* 2. NOBODY APPEARS FROM THIN AIR                                      */
/* ================================================================== */

test('an attacker activates at his staging zone, not in the foyer', () => {
  const { pool } = harness();
  const orders = releaseWave(pool, 'one');
  assert.equal(orders.length, 8);
  for (const order of orders) {
    const entry = pool.entry(order.id);
    assert.ok(entry, `${order.id} was built`);
    assert.equal(entry.root.position.x, order.staging.x,
      `${order.id} stands on his zone's x`);
    assert.equal(entry.root.position.z, order.staging.z,
      `${order.id} stands on his zone's z`);
  }
  assert.deepEqual(pool.spawnedInsideView(), []);
});

test('the real court-north spawn keeps each braced rig out of the stalled Lincoln', () => {
  const scene = new THREE.Scene();
  const grounds = buildMansionGrounds(scene);
  const interior = buildMansionInterior(grounds.shell);
  scene.add(grounds.root, interior.root);
  const colliders = [...grounds.colliders, ...interior.colliders];
  const damage = new MansionDamageState({ colliders, state: 'under_attack' });
  const dressing = buildSiegeDressing({ damage, grounds, interior });
  scene.add(dressing.root);
  damage.apply('under_attack');
  const pool = createAttackerPool({ scene, damage, matrix: new FactionMatrix() });
  const stalled = dressing.props.wrecks.stalled.collider;
  const positiveVolume = (left, right) => {
    const overlap = left.clone().intersect(right);
    if (overlap.isEmpty()) return 0;
    const size = overlap.getSize(new THREE.Vector3());
    return size.x * size.y * size.z;
  };

  for (const role of ['smg', 'suppressor']) {
    const entry = pool.spawn({ id: `court-spawn-${role}`, role, staging: 'court_north' },
      { silent: true });
    const contacts = renderedBodyMeshBoxes(entry)
      .map((part) => ({ name: part.name, volume: positiveVolume(part.box, stalled) }))
      .filter(({ volume }) => volume > 1e-6);
    assert.deepEqual(contacts, [], `${role} spawns through the stalled Lincoln`);
  }
});

test('every wave staging zone is outside the foyer the player is looking at', () => {
  const { pool } = harness();
  releaseWave(pool, 'one');
  releaseWave(pool, 'two');
  assert.equal(pool.all().length, 22, 'both waves, twenty-two men');
  assert.deepEqual(pool.spawnedInsideView(), []);
});

test('he walks in: a route off the graph, and he is fighting before he arrives', () => {
  const { pool } = harness();
  const orders = releaseWave(pool, 'one');
  for (const order of orders) {
    const entry = pool.entry(order.id);
    /* Six legs is the drive, the fountain, the steps, the portico, the door
     * and the foyer -- the shortest honest walk from the turnaround to the
     * bottom of a flight. A man handed fewer than that has been given a
     * shortcut through something. */
    assert.ok(entry.path.length >= 4,
      `${order.id} has only ${entry.path.length} legs from ${order.staging.id}`);
    assert.ok(entry.path.every((point) => anchorById(point.anchor)),
      `${order.id} carries a waypoint that is not on the graph`);
    /* Active from the instant he is placed -- an awareness above the firing
     * threshold, a loaded gun and a live actor. */
    assert.equal(entry.actor.incapacitated, false);
    assert.ok(entry.weapon.magazine > 0);
  }
});

test('a hunted standoff man drops his post, closes on the player, and calls it', () => {
  /* Owner, playtest 2026-08-13: "four attacks left cant find them". The
   * suppressor is the worst offender: `climbs: false`, standoff 28, set up
   * out on the door line where the gallery cannot see him. With the scene's
   * `hunt` flag up he must abandon that standoff and walk at the player --
   * and one hunted man at a time must call the search out loud. */
  const { pool } = harness();
  const orders = releaseWave(pool, 'two');
  const order = orders.find((o) => o.role.id === 'suppressor');
  const entry = pool.entry(order.id);
  const player = makePlayer();
  const barks = [];
  const steps = [];
  const ctx = (hunt) => ({
    player, colliders: [], alive: () => [], hunt,
    onBark: (event) => barks.push(event),
    onStep: (who, event) => steps.push({ id: who.id, hunt, ...event }),
  });

  /* Twenty seconds without the flag: he sets up and stays a standoff man. */
  for (let i = 0; i < 60 * 20; i++) pool.update(1 / 60, ctx(false));
  const held = entry.root.position.distanceTo(player.position);
  assert.ok(held > 12,
    `the suppressor closed to ${held.toFixed(1)} m without being hunted`);
  assert.ok(!barks.some((b) => b.key === 'hunt'), 'hunt called before the hunt');
  assert.equal(entry.hunting, false, 'flagged as hunting before the hunt');
  /* His own pace is a walk (1.2 m/s), so nothing he did so far was a run. */
  const hisStepsBefore = steps.filter((step) => step.id === entry.id);
  assert.ok(hisStepsBefore.length > 0, 'the suppressor never took a step setting up');
  assert.ok(hisStepsBefore.every((step) => step.gait === 'walk'),
    'a suppressor setting up ran');

  /* Forty seconds with it: he is closing, and somebody said so. */
  steps.length = 0;
  for (let i = 0; i < 60 * 40; i++) pool.update(1 / 60, ctx(true));
  const closed = entry.actor.incapacitated
    ? 0 : entry.root.position.distanceTo(player.position);
  assert.ok(closed < held - 4,
    `hunted, he closed only ${(held - closed).toFixed(1)} m (from ${held.toFixed(1)})`);
  assert.ok(barks.some((b) => b.key === 'hunt'), 'nobody called the hunt');
  /* THE AUDIBLE HALF. A hunted man jogs (HUNT_SPEED floors his pace), and
   * the step event grades gait and intensity off that pace -- so his feet,
   * which the player steers by, are RUNNING feet at full intensity, not the
   * standoff shuffle at half volume he was making a moment ago. */
  assert.ok(HUNT_SPEED > 2.25, 'the hunt floor must clear the run-gait line');
  assert.equal(entry.hunting, true, 'the flag did not reach the man');
  const hisStepsHunted = steps.filter((step) => step.id === entry.id);
  assert.ok(hisStepsHunted.length > 0, 'a hunted suppressor took no steps');
  assert.ok(hisStepsHunted.some((step) => step.gait === 'run' && step.intensity >= 0.99),
    `hunted, he never ran: gaits ${[...new Set(hisStepsHunted.map((s) => s.gait))]}`);
});

test('wave one comes in the front door, every man of it', () => {
  /* OWNER DIRECTION: "everyone should funnel in through the main door." Wave
   * one is where that is taught, so it is all door and no exceptions -- and
   * "through the door" is asserted as the leg that crosses `frontDoor`
   * rather than as the name of a staging zone. */
  const { pool } = harness();
  for (const order of releaseWave(pool, 'one')) {
    const entry = pool.entry(order.id);
    let previous = { x: order.staging.x, z: order.staging.z, y: null };
    const crossed = [];
    for (const point of entry.path) {
      const crossing = crossingFor(previous, point);
      if (crossing) crossed.push(crossing.opening.id);
      previous = point;
    }
    assert.ok(crossed.includes('frontDoor'),
      `${order.id} got inside through ${crossed.join(', ') || 'nothing'}`);
    assert.equal(crossed.filter((id) => OPENINGS.find((o) => o.id === id)?.glass).length, 0,
      `${order.id} broke a window in wave one`);
  }
});

test('an attacker who wanders out of the boundary is pulled back', () => {
  const { colliders, pool } = harness();
  const orders = releaseWave(pool, 'one');
  const entry = pool.entry(orders[0].id);
  /* Send him into the hedge maze by hand -- the exact failure the boundary
   * exists for, which would otherwise strand the wave-cleared check. */
  entry.root.position.set(200, 0, 200);
  const player = makePlayer();
  for (let i = 0; i < 30; i++) pool.update(1 / 60, { player, colliders, alive: [] });
  assert.ok(entry.pulledBack > 0, 'he was pulled back');
  assert.ok(entry.root.position.x <= COMBAT_BOUNDARY.x1);
  assert.ok(entry.root.position.z <= COMBAT_BOUNDARY.z1);
  assert.deepEqual(pool.outsideBoundary(), []);
});

test('a whole wave fought for a minute never leaves the boundary', () => {
  const { colliders, pool } = harness();
  releaseWave(pool, 'two');
  const player = makePlayer();
  for (let i = 0; i < 60 * 60; i++) {
    pool.update(1 / 60, { player, colliders, alive: [] });
    if (player.actor.health <= 10) {
      player.actor.health = 100;
      player.actor.incapacitated = false;
    }
  }
  assert.deepEqual(pool.outsideBoundary(), []);
});

test('only the two glass zones are reported as breaches', () => {
  /* The first version of this guessed from geometry and reported the rear
   * service DOOR as a broken window. The glass owner would have shattered a
   * door. Two zones come through glass and the brief names both. */
  const { colliders, pool } = harness();
  releaseWave(pool, 'two');
  const player = makePlayer();
  for (let i = 0; i < 60 * 40; i++) {
    pool.update(1 / 60, { player, colliders, alive: [] });
    if (player.actor.health <= 10) {
      player.actor.health = 100;
      player.actor.incapacitated = false;
    }
  }
  const zones = new Set(pool.breaches().map((breach) => breach.staging));
  assert.ok(zones.size > 0, 'somebody did come through glass');
  for (const zone of zones) {
    assert.ok(['lounge_bay', 'living_west'].includes(zone),
      `"${zone}" is a door or a terrace, not a window`);
  }
});

/* ================================================================== */
/* 3. onDown, EXACTLY ONCE                                              */
/* ================================================================== */

test('onDown fires exactly once when the player kills an attacker', () => {
  const { pool, downs } = harness();
  const orders = releaseWave(pool, 'one');
  const entry = pool.entry(orders[0].id);
  pool.registerHit(entry.figure.parts.head, 9999, 0.4);
  assert.deepEqual(downs, [entry.id]);
  /* Shooting a body is not a second casualty. */
  pool.registerHit(entry.figure.parts.head, 9999, 0.4);
  pool.registerHit(entry.figure.parts.body, 9999, 0.4);
  assert.deepEqual(downs, [entry.id]);
});

test('onDown fires exactly once when a FRIENDLY kills an attacker', () => {
  /* The bug this test exists for: an attacker shot by somebody other than
   * the player had his actor incapacitated and his body still standing, and
   * the wave director was never told -- so the wave could not clear. */
  const { pool, downs, matrix } = harness();
  const orders = releaseWave(pool, 'one');
  const entry = pool.entry(orders[1].id);
  entry.actor.applyHit({ amount: 9999, attacker: { faction: FACTIONS.CREW }, matrix });
  assert.equal(entry.actor.incapacitated, true);
  assert.deepEqual(downs, [], 'nothing has reported it yet');
  const player = makePlayer();
  pool.update(1 / 60, { player, colliders: [], alive: [] });
  assert.deepEqual(downs, [entry.id], 'the sweep catches it');
  for (let i = 0; i < 120; i++) pool.update(1 / 60, { player, colliders: [], alive: [] });
  assert.deepEqual(downs, [entry.id], 'and only once');
});

test('a cartel body settles on the actual visible route surface under him', () => {
  /* The route's navigation y is not uniformly the visible surface. Drive
   * pavers are 50 mm above y=0, the two stair systems have discrete treads,
   * interior finish is 20/22 mm above its slab, and lawns/portico use the
   * datum itself. A single +20 mm rule is wrong in every other location. */
  const scene = new THREE.Scene();
  const grounds = buildMansionGrounds(scene);
  const interior = buildMansionInterior(grounds.shell);
  scene.add(grounds.root, interior.root);
  const damage = new MansionDamageState({
    colliders: [...grounds.colliders, ...interior.colliders], state: 'under_attack',
  });
  const pool = createAttackerPool({ scene, damage, matrix: new FactionMatrix() });
  const order = { id: 'surface-probe', role: 'rifle', staging: 'court_north' };
  const surfaces = [
    ['driveway', 0, 0, 20.5, 0.05, null],
    ['west lawn', -28.5, 0, 44.4, 0, null],
    ['front tread', 0, 0, 34, 0.16, null],
    ['portico', 0, 1.2, 35.75, 1.2, null],
    ['foyer runner', 0, 1.2, 40, 1.222, /^foyer-threshold-runner$/],
    ['east flight runner', 7, 3.6, 45, 3.76, /^horseshoe-east-runner$/],
    ['gallery runner', 7, 6, 49, 6.022, /^gallery-runner-rug$/],
    ['cellar runner', -4, -2.8, 65.8, -2.776, /^cellar-hall-runner$/],
  ];
  for (const [label, x, y, z, expectedY, expectedName] of surfaces) {
    const entry = pool.spawn(order, { silent: true });
    entry.root.position.set(x, y, z);
    entry.root.updateMatrixWorld(true);
    const support = firstVisibleSupport(scene, entry.root, x, y, z);
    assert.ok(support, `${label} has no positive-footprint visible support under the route`);
    assert.ok(Math.abs(support.point.y - expectedY) <= 0.001,
      `${label} support moved to ${support.point.y.toFixed(3)} m`);
    if (expectedName) assert.match(support.object.name, expectedName);
    pool.registerHit(entry.figure.parts.head, 9999);
    /* A live kill FALLS now (blendSiegeFall, 0.4 s); walk the figure through
     * it before measuring where the body came to rest. */
    for (let i = 0; i < 36; i++) entry.figure.update(1 / 60);
    const body = renderedBodyBox(entry);
    const gap = body.min.y - support.point.y;
    assert.ok(Math.abs(gap) <= 0.005,
      `${label} body is ${(gap * 1000).toFixed(1)} mm from its real visible support`);
  }
});

test('cartel corpse support ignores blood and resolves the authored walkable finish', () => {
  const scene = new THREE.Scene();
  const grounds = buildMansionGrounds(scene);
  const interior = buildMansionInterior(grounds.shell);
  scene.add(grounds.root, interior.root);
  const colliders = [...grounds.colliders, ...interior.colliders];
  const damage = new MansionDamageState({ colliders, state: 'under_attack' });
  const blood = new DeathBloodPool(scene, { capacity: 1, growthSeconds: 0.001 });
  const stain = blood.spill(new THREE.Vector3(7, 6.022, 49), {
    floorY: 6.022, size: 1.8, opacity: 0.88, seed: 17,
  });
  blood.update(1);
  assert.ok(Math.abs(stain.position.y - 6.028) <= 1e-9,
    'the falsifier no longer sits above the gallery runner');

  const pool = createAttackerPool({ scene, damage, matrix: new FactionMatrix() });
  const entry = pool.spawn({ id: 'blood-support-probe', role: 'rifle', staging: 'court_north' },
    { silent: true });
  entry.root.position.set(7, 6, 49);
  entry.root.updateMatrixWorld(true);
  pool.registerHit(entry.figure.parts.head, 9999);
  /* Walk the 0.4 s fall blend to its rest before measuring. */
  for (let i = 0; i < 36; i++) entry.figure.update(1 / 60);
  const bodyGap = renderedBodyBox(entry).min.y - 6.022;
  assert.ok(Math.abs(bodyGap) <= 0.001,
    `blood/VFX was mistaken for structural support and floated the body ${(bodyGap * 1000).toFixed(1)} mm`);
});

test('standing cartel roots follow the real discrete front treads and the portico has no hole', () => {
  const scene = new THREE.Scene();
  const grounds = buildMansionGrounds(scene);
  const interior = buildMansionInterior(grounds.shell);
  scene.add(grounds.root, interior.root);
  const damage = new MansionDamageState({
    colliders: [...grounds.colliders, ...interior.colliders], state: 'under_attack',
  });
  const pool = createAttackerPool({ scene, damage, matrix: new FactionMatrix() });
  const probes = [
    ['steps_centre', 34.2],
    ['porch_centre', 35.1],
  ];
  for (const [label, z] of probes) {
    const support = firstVisibleSupport(scene, null, 0, groundHeightAt(0, z), z);
    assert.ok(support, `${label} has no real tread under it`);
    const entry = pool.spawn({
      id: `standing-${label}`,
      role: 'rifle',
      staging: { id: `standing-${label}`, x: 0, z, entry: label },
    }, { silent: true });
    const rootGap = entry.root.position.y - support.point.y;
    assert.ok(Math.abs(rootGap) <= 0.005,
      `${label} standing root penetrates the tread by ${(-rootGap * 1000).toFixed(1)} mm`);
    const bodyGap = renderedBodyBox(entry).min.y - support.point.y;
    assert.ok(Math.abs(bodyGap) <= 0.005,
      `${label} rendered feet penetrate the tread by ${(-bodyGap * 1000).toFixed(1)} mm`);
  }

  /* The sixth tread ended at z=35.405 while the portico began at 35.500.
   * Probe the seam itself: the route must never drop 1.14 m onto the court
   * paving for a 95 mm strip between the two pieces of entry architecture. */
  const seam = firstVisibleSupport(scene, null, 0, 1.18, 35.45);
  assert.ok(seam && seam.point.y >= 1.15,
    `front-entry seam drops to ${seam?.point.y.toFixed(3) ?? 'no'} m instead of joining the portico`);
});

test('a moving cartel attacker never eases his rendered feet through a front tread', () => {
  /* Spawn support is not enough. act() used to ease root.y toward the next
   * discrete tread, so the same man who began exactly on the paving was
   * 312 mm inside one tread and 420 mm inside another while walking up. This
   * runs the real graph route and measures the real first visible surface on
   * every transition frame. */
  const scene = new THREE.Scene();
  const grounds = buildMansionGrounds(scene);
  const interior = buildMansionInterior(grounds.shell);
  scene.add(grounds.root, interior.root);
  const colliders = [...grounds.colliders, ...interior.colliders];
  const damage = new MansionDamageState({ colliders, state: 'under_attack' });
  const pool = createAttackerPool({ scene, damage, matrix: new FactionMatrix() });
  const entry = pool.spawn({
    id: 'moving-front-step-probe', role: 'rifle', staging: 'front_steps',
  }, { silent: true });
  const player = makePlayer(0, 1.2, 40);
  const measured = [];
  for (let frame = 0; frame < 120; frame += 1) {
    pool.update(1 / 60, { player, colliders, alive: [] });
    if (Math.abs(entry.root.position.x) > 6
        || entry.root.position.z < 33.84 || entry.root.position.z > 35.5) continue;
    const support = firstVisibleSupport(
      scene, entry.root, entry.root.position.x, entry.root.position.y, entry.root.position.z,
      { walkableOnly: true },
    );
    assert.ok(support, `frame ${frame} has no real front-entry support`);
    const gap = renderedBodyBox(entry).min.y - support.point.y;
    measured.push({ frame, z: entry.root.position.z, supportY: support.point.y, gap });
    assert.ok(gap >= -0.005 && gap <= 0.005,
      `frame ${frame} z=${entry.root.position.z.toFixed(3)} rendered feet are `
      + `${(-gap * 1000).toFixed(1)} mm inside the ${support.object.name || 'unnamed tread'}`);
  }
  assert.ok(measured.length >= 30, `only ${measured.length} front-entry movement frames were measured`);
  assert.ok(Math.max(...measured.map(({ supportY }) => supportY)) >= 1.16,
    'the moving probe never reached the upper front treads');
});

test('both real flank breach routes climb physical support and clear the window opening', () => {
  const scene = new THREE.Scene();
  const grounds = buildMansionGrounds(scene);
  const interior = buildMansionInterior(grounds.shell);
  scene.add(grounds.root, interior.root);
  const colliders = [...grounds.colliders, ...interior.colliders];
  const damage = new MansionDamageState({ colliders, state: 'under_attack' });
  const glass = buildSiegeGlass({ damage, grounds, interior });
  scene.add(glass.root);
  damage.apply('under_attack');
  const pool = createAttackerPool({ scene, damage, matrix: new FactionMatrix() });
  releaseWave(pool, 'two');
  const flankers = pool.all().filter(({ staging }) => (
    staging.id === 'lounge_bay' || staging.id === 'living_west'
  ));
  assert.equal(flankers.length, 4, 'the route sweep no longer covers the whole 2B flank group');
  const records = new Map(flankers.map((entry) => [entry.id, {
    side: entry.staging.id === 'lounge_bay' ? 'east' : 'west',
    samples: 0,
    supports: new Set(),
  }]));
  const breachStructures = [];
  grounds.root.updateMatrixWorld(true);
  grounds.root.traverse((object) => {
    if (!object.isMesh || !/^(?:bay-east|wing-west)-solid$|^(?:bay|wing)-podium$/.test(object.name)) return;
    breachStructures.push({ object, box: new THREE.Box3().setFromObject(object) });
  });
  const positiveVolume = (left, right) => {
    const overlap = left.clone().intersect(right);
    if (overlap.isEmpty()) return 0;
    const size = overlap.getSize(new THREE.Vector3());
    return size.x * size.y * size.z;
  };
  const paneForOpening = new Map(
    [...glass.panes.values()].map((pane) => [pane.window, pane]),
  );
  for (let frame = 0; frame < 720; frame += 1) {
    pool.update(1 / 60, {
      colliders,
      alive: [],
      onBreach: ({ id, opening }) => {
        const pane = paneForOpening.get(opening);
        assert.ok(pane, `${id} reports unknown breach pane ${opening}`);
        const changed = glass.shatter(pane.id);
        assert.ok(changed || pane.state === 'broken', `${opening} failed to open idempotently`);
      },
    });
    for (const entry of flankers) {
      const { x, z } = entry.root.position;
      const record = records.get(entry.id);
      const inBreachRun = record.side === 'east'
        ? x >= 19.0 && x <= 23.7 && z >= 42.9 && z <= 44.6
        : x >= -27.5 && x <= -22.4 && z >= 43.0 && z <= 45.8;
      if (!inBreachRun) continue;
      const support = highestWalkableSupport(scene, entry.root, x, z);
      assert.ok(support, `${entry.id} ${record.side} frame ${frame} has no physical breach support`);
      const body = renderedBodyBox(entry);
      const gap = body.min.y - support.point.y;
      record.samples += 1;
      record.supports.add(`${support.object.name}:${support.point.y.toFixed(3)}`);
      assert.ok(gap >= -0.005 && gap <= 0.005,
        `${entry.id} ${record.side} frame ${frame} x=${x.toFixed(3)} body is `
        + `${(-gap * 1000).toFixed(1)} mm inside ${support.object.name}`);
      for (const structure of breachStructures) {
        const volume = positiveVolume(body, structure.box);
        assert.ok(volume <= 1e-6,
          `${entry.id} ${record.side} frame ${frame} root=[${x.toFixed(4)},${entry.root.position.y.toFixed(4)},${z.toFixed(4)}] `
          + `body occupies ${volume.toFixed(6)} m3 of ${structure.object.name}`);
      }
    }
  }
  for (const [id, record] of records) {
    assert.ok(record.samples >= 35, `${id}/${record.side} produced only ${record.samples} breach samples`);
    assert.ok(record.supports.size >= 5,
      `${id}/${record.side} crossed only ${record.supports.size} physical support levels`);
  }
});

test('the east flanker clears the south bay jamb before handing off from bay_arch', () => {
  assert.equal(anchorById('bay_arch').arrival, 0.25,
    'bay_arch lost the full-rig clearance handoff');
  const scene = new THREE.Scene();
  const grounds = buildMansionGrounds(scene);
  const interior = buildMansionInterior(grounds.shell);
  scene.add(grounds.root, interior.root);
  const colliders = [...grounds.colliders, ...interior.colliders];
  const damage = new MansionDamageState({ colliders, state: 'under_attack' });
  const glass = buildSiegeGlass({ damage, grounds, interior });
  scene.add(glass.root);
  damage.apply('under_attack');
  const pool = createAttackerPool({ scene, damage, matrix: new FactionMatrix() });
  /* Preserve the real actor index/lane while isolating this route's geometry. */
  releaseWave(pool, 'one');
  pool.despawnAll();
  releaseWave(pool, 'two');
  const entry = pool.entry('two_2B_2');
  for (const peer of pool.all()) {
    if (peer === entry) continue;
    peer.active = false;
    peer.root.visible = false;
  }
  const southJamb = colliders.find((box) => (
    Math.abs(box.min.x - 15.98) < 0.001 && Math.abs(box.max.x - 16.42) < 0.001
    && Math.abs(box.min.z - 44.58) < 0.001 && Math.abs(box.max.z - 45.62) < 0.001
  ));
  assert.ok(southJamb, 'the real south bay jamb collider was not found');
  const paneForOpening = new Map(
    [...glass.panes.values()].map((pane) => [pane.window, pane]),
  );
  const contacts = [];
  let approachedBayArch = false;
  let clearedBayArch = false;
  for (let frame = 0; frame < 1800 && entry.path.length; frame += 1) {
    const before = entry.path[0]?.anchor?.id ?? entry.path[0]?.anchor;
    pool.update(1 / 60, {
      colliders, alive: [],
      onBreach: ({ opening }) => {
        const pane = paneForOpening.get(opening);
        assert.ok(pane, `unknown breach pane ${opening}`);
        glass.shatter(pane.id);
      },
    });
    const after = entry.path[0]?.anchor?.id ?? entry.path[0]?.anchor;
    if (before === 'bay_arch') approachedBayArch = true;
    if (approachedBayArch && after !== 'bay_arch') clearedBayArch = true;
    if (entry.root.position.x < 14 || entry.root.position.x > 17
        || entry.root.position.z < 42 || entry.root.position.z > 46) continue;
    for (const part of renderedBodyMeshBoxes(entry)) {
      const overlap = part.box.clone().intersect(southJamb);
      if (overlap.isEmpty()) continue;
      const size = overlap.getSize(new THREE.Vector3());
      const volume = size.x * size.y * size.z;
      if (volume > 1e-6) contacts.push({ frame, part: part.name, volume });
    }
  }
  assert.equal(approachedBayArch, true, 'the focused flanker never reached bay_arch');
  assert.equal(clearedBayArch, true, 'the focused flanker never handed off from bay_arch');
  assert.deepEqual(contacts, [], `the flanker entered the south bay jamb: ${JSON.stringify(contacts)}`);
});

test('all 22 lane-expanded routes keep a real capsule and rendered body out of active geometry', (t) => {
  /* Combat think/turn timing uses Math.random.  A geometry contract cannot
   * pass or fail according to which random yaw happened to be sampled on a
   * given run, so this full-route sweep owns and restores a deterministic
   * stream.  Separate worst-yaw coverage below protects the complete rig
   * envelope rather than relying on this one animation trace. */
  const originalRandom = Math.random;
  let randomState = 0x51e9d35b;
  Math.random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 0x100000000;
  };
  t.after(() => { Math.random = originalRandom; });
  const scene = new THREE.Scene();
  const grounds = buildMansionGrounds(scene);
  const interior = buildMansionInterior(grounds.shell);
  scene.add(grounds.root, interior.root);
  const colliders = [...grounds.colliders, ...interior.colliders];
  const damage = new MansionDamageState({ colliders, state: 'under_attack' });
  const dressing = buildSiegeDressing({ damage, grounds, interior });
  const glass = buildSiegeGlass({ damage, grounds, interior });
  scene.add(dressing.root, glass.root);
  damage.apply('under_attack');
  const pool = createAttackerPool({ scene, damage, matrix: new FactionMatrix() });
  /* The mission never releases wave two until wave one is clear. Running all
   * 22 simultaneously lets wave-two's two authored threshold hold posts plug
   * the door in front of a wave-one climber -- a checkpoint state the actual
   * director cannot create. Keep one deterministic sweep and all 22 records,
   * but exercise each live wave in its real lifecycle order. */
  const entries = [];
  const paneForOpening = new Map(
    [...glass.panes.values()].map((pane) => [pane.window, pane]),
  );
  const breachedAt = new Map();
  const completedAt = new Map();
  const routeContacts = new Map();
  const radius = 0.3;
  const capsuleTop = 1.7;
  const positiveVolume = (left, right) => {
    const overlap = left.clone().intersect(right);
    if (overlap.isEmpty()) return 0;
    const size = overlap.getSize(new THREE.Vector3());
    return size.x * size.y * size.z;
  };
  const capsuleDistance = (entry, foot, box) => {
    if (box.max.y <= foot + 0.005 || box.min.y >= foot + capsuleTop) return Infinity;
    const x = entry.root.position.x;
    const z = entry.root.position.z;
    const dx = Math.max(box.min.x - x, 0, x - box.max.x);
    const dz = Math.max(box.min.z - z, 0, z - box.max.z);
    return Math.hypot(dx, dz);
  };
  const recordContact = (kind, entry, frame, index, obstacle, detail) => {
    const key = `${kind}:${index}`;
    const current = routeContacts.get(key);
    if (current) {
      current.ids.add(entry.id);
      current.maxPenetrationMm = Math.max(
        current.maxPenetrationMm ?? 0, detail.penetrationMm ?? 0,
      );
      current.maxVolume = Math.max(current.maxVolume ?? 0, detail.volume ?? 0);
      return;
    }
    routeContacts.set(key, {
      kind, ids: new Set([entry.id]), frame, index,
      position: entry.root.position.toArray(), yaw: entry.root.rotation.y,
      goal: entry.goal.toArray(), next: entry.path[0]?.anchor?.id ?? entry.path[0]?.anchor ?? 'none',
      collider: [obstacle.min.toArray(), obstacle.max.toArray()],
      firstPart: detail.part ?? null,
      maxPenetrationMm: detail.penetrationMm ?? 0,
      maxVolume: detail.volume ?? 0,
    });
  };
  const maxFrames = 2400;
  let elapsedFrames = 0;
  for (const waveId of ['one', 'two']) {
    if (entries.length) pool.despawnAll();
    const phaseEntries = releaseWave(pool, waveId).map(({ id }) => pool.entry(id));
    entries.push(...phaseEntries);
    const phaseCompleted = new Set();
    let phaseFrame = 0;
    for (; phaseFrame < maxFrames && phaseCompleted.size < phaseEntries.length; phaseFrame += 1) {
      const frame = elapsedFrames + phaseFrame;
      pool.update(1 / 60, {
        colliders,
        alive: [],
        onBreach: ({ id, opening }) => {
          const pane = paneForOpening.get(opening);
          assert.ok(pane, `${id} reports unknown breach pane ${opening}`);
          const changed = glass.shatter(pane.id);
          assert.ok(changed || pane.state === 'broken', `${opening} failed to open idempotently`);
          breachedAt.set(id, { frame, opening, pane });
        },
      });
      for (const entry of phaseEntries) {
        if (!entry.active || entry.actor.incapacitated || phaseCompleted.has(entry.id)) continue;
        if (!entry.path.length) {
          phaseCompleted.add(entry.id);
          completedAt.set(entry.id, frame);
          continue;
        }
        const body = renderedBodyBox(entry);
        const parts = renderedBodyMeshBoxes(entry);
        for (let index = 0; index < colliders.length; index += 1) {
          const obstacle = colliders[index];
          const capsuleGap = capsuleDistance(entry, body.min.y, obstacle) - radius;
          if (capsuleGap < -1e-6) {
            recordContact('capsule', entry, frame, index, obstacle, {
              penetrationMm: -capsuleGap * 1000,
            });
          }
          /* Only descend into the per-mesh boxes when the cheap union broad
           * phase overlaps. This keeps the whole-route test fast while
           * refusing the empty-space false positives of one giant rig AABB. */
          if (positiveVolume(body, obstacle) <= 1e-6) continue;
          for (const part of parts) {
            const volume = positiveVolume(part.box, obstacle);
            if (volume <= 1e-6) continue;
            recordContact('mesh', entry, frame, index, obstacle, {
              part: part.name, volume,
            });
          }
        }
      }
    }
    elapsedFrames += phaseFrame;
    assert.equal(phaseCompleted.size, phaseEntries.length,
      `${waveId} routes did not finish inside ${maxFrames} frames: ${phaseEntries
        .filter((entry) => !phaseCompleted.has(entry.id))
        .map((entry) => (
          `${entry.id}:${entry.path[0]?.anchor?.id ?? entry.path[0]?.anchor ?? 'none'}`
          + `@[${entry.root.position.x.toFixed(4)},${entry.root.position.z.toFixed(4)}]`
        )).join(', ')}`);
  }
  assert.equal(entries.length, 22);
  assert.equal(completedAt.size, entries.length,
    `routes did not finish inside ${maxFrames} frames: ${entries
      .filter((entry) => !completedAt.has(entry.id))
      .map((entry) => (
        `${entry.id}:${entry.path[0]?.anchor?.id ?? entry.path[0]?.anchor ?? 'none'}`
        + `@[${entry.root.position.x.toFixed(4)},${entry.root.position.z.toFixed(4)}]`
        + ` goal=[${entry.goal.x.toFixed(4)},${entry.goal.z.toFixed(4)}]`
        + ` path=${entry.path.length} blocked=${entry.blocked} recovered=${entry.recovered}`
        + ` peers=${entries.filter((peer) => peer !== entry)
          .map((peer) => ({ id: peer.id, d: peer.root.position.distanceTo(entry.root.position) }))
          .sort((a, b) => a.d - b.d).slice(0, 3)
          .map(({ id, d }) => `${id}:${d.toFixed(4)}`).join('|')}`
      ))
      .join(', ')}`);
  const contactReport = [...routeContacts.values()].map((record) => ({
    ...record, ids: [...record.ids].sort(),
  }));
  assert.deepEqual(contactReport, [],
    `real route contacts:\n${JSON.stringify(contactReport, null, 2)}`);
  for (const entry of entries.filter(({ staging }) => (
    staging.id === 'living_west' || staging.id === 'lounge_bay'
  ))) {
    const breach = breachedAt.get(entry.id);
    assert.ok(breach, `${entry.id} never broke its pane`);
    assert.equal(breach.pane.state, 'broken');
    assert.equal(colliders.includes(breach.pane.box), false,
      `${entry.id} left ${breach.opening}'s collider active`);
  }
});

test('moving cartel feet stay on both horseshoe flights and the basement treads', () => {
  const scene = new THREE.Scene();
  const grounds = buildMansionGrounds(scene);
  const interior = buildMansionInterior(grounds.shell);
  scene.add(grounds.root, interior.root);
  const colliders = [...grounds.colliders, ...interior.colliders];
  const damage = new MansionDamageState({ colliders, state: 'under_attack' });
  const pool = createAttackerPool({ scene, damage, matrix: new FactionMatrix() });
  const routes = [
    ['east horseshoe', 7.0, 1.36, 42.125, 7.0, 6.0, 47.9, /^horseshoe-east-(tread|runner)$/],
    ['west horseshoe', -7.0, 1.36, 42.125, -7.0, 6.0, 47.9, /^horseshoe-west-(tread|runner)$/],
    ['basement stair', 7.2, 1.2, 51.159, 7.2, -2.8, 57.84, /^basement-stair-tread$/],
  ];
  for (const [label, x0, y0, z0, x1, y1, z1, supportName] of routes) {
    const entry = pool.spawn({
      id: `moving-${label.replaceAll(' ', '-')}`, role: 'rifle', staging: 'front_steps',
    }, { silent: true });
    entry.root.position.set(x0, y0, z0);
    entry.goal.set(x1, y1, z1);
    entry.path = [{ x: x1, y: y1, z: z1, anchor: null }];
    entry.floorY = null;
    entry.sinceThink = -1000;
    const levels = new Set();
    let samples = 0;
    for (let frame = 0; frame < 240; frame += 1) {
      pool.update(1 / 60, { colliders, alive: [] });
      const support = firstVisibleSupport(
        scene, entry.root, entry.root.position.x, entry.root.position.y, entry.root.position.z,
        { walkableOnly: true },
      );
      if (!support || !supportName.test(support.object.name)) continue;
      samples += 1;
      levels.add(support.point.y.toFixed(3));
      const gap = renderedBodyBox(entry).min.y - support.point.y;
      assert.ok(gap >= -0.005 && gap <= 0.005,
        `${label} frame ${frame} z=${entry.root.position.z.toFixed(3)} feet are `
        + `${(-gap * 1000).toFixed(1)} mm inside ${support.object.name}`);
    }
    assert.ok(samples >= 60, `${label} measured only ${samples} moving support frames`);
    assert.ok(levels.size >= 12, `${label} crossed only ${levels.size} discrete support levels`);
  }
});

test('moving cartel feet honor foyer, gallery, and cellar finish offsets', () => {
  const scene = new THREE.Scene();
  const grounds = buildMansionGrounds(scene);
  const interior = buildMansionInterior(grounds.shell);
  scene.add(grounds.root, interior.root);
  const colliders = [...grounds.colliders, ...interior.colliders];
  const damage = new MansionDamageState({ colliders, state: 'under_attack' });
  const pool = createAttackerPool({ scene, damage, matrix: new FactionMatrix() });
  const probes = [
    ['foyer', 'front_steps', [0, 1.2, 39], [2, 1.2, 39], 1.222, /^foyer-threshold-runner$/],
    ['gallery', 'front_steps', [7, 6, 49], [9, 6, 50], 6.022, /^gallery-runner-rug$/],
    ['cellar', 'cellar_hall', [-4, -2.8, 65.8], [0, -2.8, 65.8], -2.776, /^cellar-hall-runner$/],
  ];
  for (const [label, staging, start, end, expectedY, supportName] of probes) {
    const entry = pool.spawn({ id: `moving-${label}-finish`, role: 'rifle', staging },
      { silent: true });
    entry.root.position.fromArray(start);
    entry.goal.fromArray(end);
    entry.path = [{ x: end[0], y: end[1], z: end[2], anchor: null }];
    entry.sinceThink = -1000;
    for (let frame = 0; frame < 45; frame += 1) {
      pool.update(1 / 60, { colliders, alive: [] });
      const support = firstVisibleSupport(
        scene, entry.root, entry.root.position.x, entry.root.position.y, entry.root.position.z,
        { walkableOnly: true },
      );
      assert.ok(support && supportName.test(support.object.name),
        `${label} frame ${frame} resolved ${support?.object.name || 'no support'}`);
      assert.ok(Math.abs(support.point.y - expectedY) <= 0.001,
        `${label} support moved to ${support.point.y.toFixed(3)} m`);
      const gap = renderedBodyBox(entry).min.y - support.point.y;
      assert.ok(gap >= -0.005 && gap <= 0.005,
        `${label} frame ${frame} feet are ${(-gap * 1000).toFixed(1)} mm inside the finish`);
    }
  }
});

test('static support indexing never forces a whole mansion matrix update per attacker frame', () => {
  const scene = new THREE.Scene();
  const grounds = buildMansionGrounds(scene);
  const interior = buildMansionInterior(grounds.shell);
  scene.add(grounds.root, interior.root);
  const colliders = [...grounds.colliders, ...interior.colliders];
  const originalUpdate = scene.updateMatrixWorld.bind(scene);
  let wholeSceneUpdates = 0;
  scene.updateMatrixWorld = (force) => {
    wholeSceneUpdates += 1;
    return originalUpdate(force);
  };
  const damage = new MansionDamageState({ colliders, state: 'under_attack' });
  const pool = createAttackerPool({ scene, damage, matrix: new FactionMatrix() });
  for (let index = 0; index < 22; index += 1) {
    pool.spawn({ id: `support-perf-${index}`, role: 'rifle', staging: 'front_steps' },
      { silent: true });
  }
  assert.equal(wholeSceneUpdates, 1, 'the static support index was rebuilt during spawn');
  wholeSceneUpdates = 0;
  for (let frame = 0; frame < 30; frame += 1) {
    pool.update(1 / 60, { colliders, alive: [] });
  }
  assert.equal(wholeSceneUpdates, 0,
    `${wholeSceneUpdates} forced whole-scene matrix updates occurred during 30 live frames`);
});

test('all 22 wave attackers ground rendered bodies without changing pooled weapon mounts', () => {
  const scene = new THREE.Scene();
  const grounds = buildMansionGrounds(scene);
  const interior = buildMansionInterior(grounds.shell);
  scene.add(grounds.root, interior.root);
  const damage = new MansionDamageState({
    colliders: [...grounds.colliders, ...interior.colliders], state: 'under_attack',
  });
  const pool = createAttackerPool({ scene, damage, matrix: new FactionMatrix() });
  const orders = [...releaseWave(pool, 'one'), ...releaseWave(pool, 'two')];
  assert.equal(orders.length, 22);
  assert.deepEqual(new Set(orders.map((order) => order.role.id)), new Set(Object.keys(ROLE_PLAN)),
    'the body-support sweep no longer covers every cartel role');

  const records = orders.map((order) => {
    const entry = pool.entry(order.id);
    entry.root.position.set(7, 6, 49);
    entry.root.updateMatrixWorld(true);
    return { order, entry, mount: captureWeaponMount(entry) };
  });
  for (const { entry } of records) {
    pool.registerHit(entry.figure.parts.head, 9999);
    /* Walk the 0.4 s fall blend to its rest before measuring. */
    for (let i = 0; i < 36; i++) entry.figure.update(1 / 60);
  }

  for (const { order, entry, mount } of records) {
    const gap = renderedBodyBox(entry).min.y - 6.02;
    assert.ok(Math.abs(gap) <= 0.005,
      `${order.id}/${order.role.id}/${ROLE_PLAN[order.role.id].weapon} body is `
      + `${(gap * 1000).toFixed(1)} mm from the gallery finish`);
    assert.equal(entry.figure.pose, 'fallen');
    assert.equal(entry.gun.visible, false,
      `${order.id}/${order.role.id} keeps a gun welded through the fallen pose`);
    assertWeaponMount(entry, mount, `${order.id}/${order.role.id} down`);

    pool.spawn(order, { silent: true });
    assert.equal(entry.figure.pose, 'aiming', `${order.id}/${order.role.id} did not stand on respawn`);
    assert.equal(entry.gun.visible, true, `${order.id}/${order.role.id} did not recover its weapon`);
    assertWeaponMount(entry, mount, `${order.id}/${order.role.id} respawn`);
  }
});

test('a whole wave reports every man once and only once', () => {
  const { pool, downs } = harness();
  const orders = releaseWave(pool, 'two');
  for (const order of orders) pool.registerHit(pool.entry(order.id).figure.parts.head, 9999);
  assert.equal(downs.length, orders.length);
  assert.equal(new Set(downs).size, downs.length, 'no id twice');
  assert.deepEqual([...downs].sort(), orders.map((o) => o.id).sort());
  assert.deepEqual(pool.living(), []);
});

test('a wave director fed the pool\'s reports actually clears', () => {
  /* The whole chain the mission depends on, end to end. */
  const director = new WaveDirector({ wave: 'one' });
  const scene = new THREE.Scene();
  const damage = new MansionDamageState({ colliders: [], state: 'under_attack' });
  const pool = createAttackerPool({
    scene, damage, matrix: new FactionMatrix(), onDown: (id) => director.noteDown(id),
  });
  const orders = [...director.begin()];
  for (const order of orders) pool.spawn(order);
  orders.push(...director.update(30));
  for (const order of orders.slice(4)) pool.spawn(order);
  assert.equal(director.cleared, false);
  for (const order of orders) pool.registerHit(pool.entry(order.id).figure.parts.head, 9999);
  assert.equal(director.cleared, true, 'the wave cleared off the pool\'s own reports');
});

/* ================================================================== */
/* 4. CHECKPOINTS                                                       */
/* ================================================================== */

test('restore does not resurrect anybody and does not report a death twice', () => {
  const { pool, downs } = harness();
  const orders = releaseWave(pool, 'one');
  const dead = orders.slice(0, 3).map((order) => order.id);
  for (const id of dead) pool.registerHit(pool.entry(id).figure.parts.head, 9999);
  assert.equal(downs.length, 3);

  const snapshot = pool.snapshot();
  const beforeLiving = pool.living().length;
  assert.equal(beforeLiving, orders.length - 3);

  pool.restore(snapshot);
  assert.equal(downs.length, 3, 'nobody was reported a second time');
  assert.equal(pool.living().length, beforeLiving, 'and nobody stood back up');
  for (const id of dead) {
    assert.equal(pool.entry(id).actor.incapacitated, true, `${id} is still down`);
    assert.equal(pool.entry(id).actor.health, 0);
  }
  assert.deepEqual([...pool.reported()].sort(), [...dead].sort());
});

test('a restored attacker keeps his magazine, his position and his wounds', () => {
  const { colliders, pool } = harness();
  const orders = releaseWave(pool, 'one');
  const player = makePlayer();
  for (let i = 0; i < 60 * 12; i++) {
    pool.update(1 / 60, { player, colliders, alive: [] });
    if (player.actor.health <= 10) {
      player.actor.health = 100;
      player.actor.incapacitated = false;
    }
  }
  const entry = pool.entry(orders[0].id);
  pool.registerHit(entry.figure.parts.legL, 30);
  const before = {
    health: entry.actor.health,
    magazine: entry.weapon.magazine,
    position: entry.root.position.toArray(),
  };
  assert.ok(before.health < entry.actor.maxHealth, 'he was actually wounded');
  const snapshot = pool.snapshot();
  /* Wreck the live state the way a mission restart would. */
  pool.despawnAll();
  pool.restore(snapshot);
  const after = pool.entry(orders[0].id);
  assert.equal(after.actor.health, before.health);
  assert.equal(after.weapon.magazine, before.magazine);
  assert.deepEqual(after.root.position.toArray(), before.position);
});

test('the ensemble restores a dead guard as a dead guard', () => {
  const { scene, damage, matrix } = harness();
  const ensemble = buildSiegeEnsemble({ scene, damage, matrix });
  ensemble.stage('WAVE_TWO');
  const guard = ensemble.members.get('guard_0');
  guard.actor.applyHit({ amount: 9999, attacker: { faction: FACTIONS.CARTEL }, matrix });
  assert.equal(guard.actor.incapacitated, true, 'a guard is not on the survival list');

  const snapshot = ensemble.snapshot();
  /* `stage()` alone would stand him up -- that is exactly what restore must
   * not do, and why the actor is applied after the staging. */
  ensemble.stage('AFTERMATH');
  ensemble.restore(snapshot);
  assert.equal(ensemble.beat, 'WAVE_TWO');
  assert.equal(ensemble.members.get('guard_0').actor.incapacitated, true);
  assert.equal(ensemble.members.get('guard_0').figure.pose, 'fallen');
});

test('an ensemble checkpoint keeps its recorded facing through a same-floor restage', () => {
  const { scene, damage, matrix } = harness();
  const ensemble = buildSiegeEnsemble({ scene, damage, matrix });
  ensemble.stage('BRIEFING');
  const snapshot = ensemble.snapshot();
  const expectedYaw = new Map(snapshot.members
    .filter((record) => record.id === 'eric' || record.id === 'guard_1')
    .map((record) => [record.id, record.yaw]));
  assert.equal(expectedYaw.size, 2, 'the checkpoint omitted the worklamp tableau pair');

  ensemble.stage('AFTERMATH');
  assert.equal(ensemble.restore(snapshot), true);
  for (const [id, yaw] of expectedYaw) {
    assert.equal(ensemble.members.get(id).root.rotation.y, yaw,
      `${id}'s restored root no longer owns its checkpoint facing`);
  }

  /* LITTLE_FRIEND retargets both men on the same gallery floor. It therefore
   * inherits the restored facing and lets the live turn system settle it. */
  ensemble.stage('LITTLE_FRIEND');
  for (const [id, yaw] of expectedYaw) {
    assert.equal(ensemble.members.get(id).root.rotation.y, yaw,
      `${id}'s same-floor restage inherited a poisoned checkpoint facing`);
  }
});

test('the ensemble reports a friendly going down exactly once', () => {
  const { scene, colliders, damage, matrix } = harness();
  const ensemble = buildSiegeEnsemble({ scene, damage, matrix });
  ensemble.stage('WAVE_ONE');
  const reported = [];
  ensemble.members.get('guard_1').actor.applyHit({
    amount: 9999, attacker: { faction: FACTIONS.CARTEL }, matrix,
  });
  for (let i = 0; i < 240; i++) {
    ensemble.update(1 / 60, {
      colliders, hostiles: [], onFriendlyDown: (id) => reported.push(id),
    });
  }
  assert.deepEqual(reported, ['guard_1']);
});

/* ================================================================== */
/* 5. EIGHT ROLES, EIGHT BEHAVIOURS                                     */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/* Down and bleeding, and never dead                                    */
/* ------------------------------------------------------------------ */

test('a name driven to nothing goes on the floor instead of dying', () => {
  /* Owner, 2026-08-05: "let's do the 1hp option for now and the bleeding out
   * mechanic. No deaths. I don't want to have to have multiple endings
   * depending on who died."
   *
   * Before this, `core: true` floored a protected man at 1 HP and left him
   * standing there shooting -- a magazine into Booski changed nothing you
   * could see. */
  const { scene, damage, matrix } = harness();
  const ensemble = buildSiegeEnsemble({ scene, damage, matrix });
  ensemble.stage('WAVE_ONE');
  const booski = ensemble.members.get('booski');
  assert.ok(booski, 'booski is not in the house');
  booski.actor.applyHit({ amount: 9999, attacker: { faction: FACTIONS.CARTEL }, matrix });
  assert.equal(booski.actor.health, 1, 'the core protection stopped being the floor');
  assert.equal(booski.actor.incapacitated, false, 'a name died');
  ensemble.update(0.1, {});
  const down = ensemble.downed();
  assert.equal(down.length, 1, `${down.length} on the floor, expected one`);
  assert.equal(down[0].id, 'booski');
  assert.equal(ensemble.targets().some((m) => m.id === 'booski'), false,
    'a man face down is still being offered to the cartel as a target');
});

test('a downed name stays visibly fallen when the mission advances a beat', () => {
  const { scene, damage, matrix } = harness();
  const ensemble = buildSiegeEnsemble({ scene, damage, matrix });
  ensemble.stage('WAVE_ONE');
  const booski = ensemble.members.get('booski');
  booski.actor.applyHit({ amount: 9999, attacker: { faction: FACTIONS.CARTEL }, matrix });
  ensemble.update(0.1, {});
  const fallenAt = booski.root.position.clone();

  ensemble.stage('LULL');

  assert.equal(ensemble.downed().some((member) => member.id === 'booski'), true);
  assert.equal(booski.figure.pose, 'fallen',
    'the revive prompt still names a man whose rig was stood back up');
  assert.ok(booski.root.position.distanceTo(fallenAt) < 1e-6,
    'the beat transition teleported a downed man to his next posting');
});

test('reviving after a beat transition sends the ally to that beat posting', () => {
  const { scene, damage, matrix } = harness();
  const ensemble = buildSiegeEnsemble({ scene, damage, matrix });
  const reference = buildSiegeEnsemble({
    scene: new THREE.Scene(),
    damage: new MansionDamageState({ colliders: [], state: 'under_attack' }),
    matrix: new FactionMatrix(),
  });
  reference.stage('LULL');
  const lullPost = reference.members.get('booski').goal.clone();

  ensemble.stage('WAVE_ONE');
  const booski = ensemble.members.get('booski');
  booski.actor.applyHit({ amount: 9999, attacker: { faction: FACTIONS.CARTEL }, matrix });
  for (let i = 0; i < 10; i++) ensemble.update(0.1, {});
  const fallenAt = booski.root.position.clone();
  const blood = booski.bloodPool;

  ensemble.stage('LULL');
  assert.ok(booski.root.position.distanceTo(fallenAt) < 1e-6,
    'the beat transition moved the body before the player revived him');
  assert.equal(booski.figure.pose, 'fallen');
  assert.equal(blood?.visible, true);
  assert.equal(blood?.userData.memberId, 'booski');

  assert.equal(ensemble.revive('booski'), true);
  for (let i = 0; i < 20; i++) ensemble.update(0.1, { hostiles: [] });
  assert.ok(booski.root.position.distanceTo(lullPost) <= 0.23,
    `revived Booski stayed at ${booski.root.position.toArray()} instead of rejoining ${lullPost.toArray()}`);
});

test('a revivable cast member lies in an owner-tagged readable blood pool', () => {
  const { scene, damage, matrix } = harness();
  const ensemble = buildSiegeEnsemble({ scene, damage, matrix });
  ensemble.stage('WAVE_ONE');
  const booski = ensemble.members.get('booski');
  booski.actor.applyHit({ amount: 9999, attacker: { faction: FACTIONS.CARTEL }, matrix });
  for (let i = 0; i < 14; i++) ensemble.update(0.1, {});
  scene.updateMatrixWorld(true);

  const pools = [];
  scene.traverse((object) => {
    if (object.visible && object.name?.startsWith(BLOOD_POOL_NAME)
        && object.userData.memberId === 'booski') pools.push(object);
  });
  assert.equal(pools.length, 1, 'the man asking for help has no blood beneath him');
  const pool = pools[0];
  const bodyBox = new THREE.Box3().setFromObject(booski.root);
  const poolBox = new THREE.Box3().setFromObject(pool);
  assert.ok(poolBox.max.x >= bodyBox.min.x && poolBox.min.x <= bodyBox.max.x
    && poolBox.max.z >= bodyBox.min.z && poolBox.min.z <= bodyBox.max.z,
  'the blood pool is not beneath the fallen body');
  assert.ok(pool.material.opacity >= 0.7 && pool.scale.x >= 0.9,
    `the blood is not readable (${pool.material.opacity.toFixed(2)} opacity, ${pool.scale.x.toFixed(2)} m)`);
  /* Opacity and metres were a false green on the mansion's dark walnut floor:
   * the physically lit texture rendered almost black beneath a navy body.
   * Require a wet highlight plus enough red self-light to survive that actual
   * low-light surface. This is a material/radiance contract, not a name tag. */
  const emittedRed = pool.material.emissive.r * pool.material.emissiveIntensity;
  const emittedGreen = pool.material.emissive.g * pool.material.emissiveIntensity;
  const emittedBlue = pool.material.emissive.b * pool.material.emissiveIntensity;
  const poolWidth = poolBox.max.x - poolBox.min.x;
  const poolDepth = poolBox.max.z - poolBox.min.z;
  const overlapWidth = Math.max(0,
    Math.min(poolBox.max.x, bodyBox.max.x) - Math.max(poolBox.min.x, bodyBox.min.x));
  const overlapDepth = Math.max(0,
    Math.min(poolBox.max.z, bodyBox.max.z) - Math.max(poolBox.min.z, bodyBox.min.z));
  const exposedPoolArea = poolWidth * poolDepth - overlapWidth * overlapDepth;
  assert.ok(pool.material.roughness <= 0.35,
    `the blood has no wet highlight (roughness ${pool.material.roughness.toFixed(2)})`);
  assert.ok(pool.scale.x >= 1.75 && exposedPoolArea >= 0.55,
    `the ${pool.scale.x.toFixed(2)} m pool is hidden by the body (${exposedPoolArea.toFixed(2)} m2 exposed)`);
  assert.ok(emittedRed >= 0.55
    && emittedRed >= emittedGreen * 6
    && emittedRed >= emittedBlue * 3,
  `the blood cannot read red in low light (emissive ${emittedRed.toFixed(3)}, ${emittedGreen.toFixed(3)}, ${emittedBlue.toFixed(3)})`);
  assert.ok(pool.position.y >= booski.root.position.y + 0.024
    && pool.position.y <= booski.root.position.y + 0.032,
  'the blood is not on the same finished floor as the body');
});

test('an upper-gallery blood pool sits above the real finished floor, not inside its slab', () => {
  const scene = new THREE.Scene();
  const grounds = buildMansionGrounds(scene);
  const interior = buildMansionInterior(grounds.shell);
  scene.add(grounds.root, interior.root);
  const colliders = [...grounds.colliders, ...interior.colliders];
  const damage = new MansionDamageState({ colliders, state: 'under_attack' });
  const matrix = new FactionMatrix();
  const ensemble = buildSiegeEnsemble({
    scene, damage, matrix, groundAt: mansionGroundAt(grounds, interior),
  });
  ensemble.stage('LITTLE_FRIEND');

  const eric = ensemble.members.get('eric');
  eric.actor.applyHit({ amount: 9999, attacker: { faction: FACTIONS.CARTEL }, matrix });
  ensemble.update(0.1, {});
  for (let step = 0; step < 8; step++) ensemble.update(0.1, {});
  scene.updateMatrixWorld(true);

  const floorMeshes = [];
  interior.root.traverse((object) => {
    if (object.name === 'gallery-runner-rug') floorMeshes.push(object);
  });
  const support = floorMeshes.map((object) => new THREE.Box3().setFromObject(object))
    .find((box) => eric.root.position.x >= box.min.x && eric.root.position.x <= box.max.x
      && eric.root.position.z >= box.min.z && eric.root.position.z <= box.max.z);
  assert.ok(support, 'Eric has no real gallery runner beneath his authored post');
  const poolBox = new THREE.Box3().setFromObject(eric.bloodPool);
  const finishGap = poolBox.min.y - support.max.y;
  assert.ok(finishGap >= 0.004 && finishGap <= 0.008,
    `Eric's visible blood is ${finishGap.toFixed(3)} m from the topmost rendered support`);
});

test('every armed fallen rig grounds its visible body, not its hidden weapon', () => {
  const scene = new THREE.Scene();
  const grounds = buildMansionGrounds(scene);
  const interior = buildMansionInterior(grounds.shell);
  scene.add(grounds.root, interior.root);
  const colliders = [...grounds.colliders, ...interior.colliders];
  const damage = new MansionDamageState({ colliders, state: 'under_attack' });
  const matrix = new FactionMatrix();
  const ensemble = buildSiegeEnsemble({
    scene, damage, matrix, groundAt: mansionGroundAt(grounds, interior),
  });
  ensemble.stage('LITTLE_FRIEND');

  const representatives = [
    ['pistol', 'booski'], ['carbine', 'guard_1'],
    ['AK', 'eric'], ['SAW', 'deathmegatron'],
  ].map(([weapon, id]) => {
    const member = ensemble.members.get(id);
    return {
      weapon,
      member,
      parent: member.gun.parent,
      position: member.gun.position.toArray(),
      quaternion: member.gun.quaternion.toArray(),
      scale: member.gun.scale.toArray(),
    };
  });
  for (const { member } of representatives) {
    member.actor.applyHit({ amount: 9999, attacker: { faction: FACTIONS.CARTEL }, matrix });
  }
  /* A fall is a 0.45-0.55 s blend now; walk the world past it. */
  for (let i = 0; i < 8; i++) ensemble.update(0.1, { colliders, hostiles: [] });
  scene.updateMatrixWorld(true);

  const visibleBodyBox = (member) => {
    const box = new THREE.Box3();
    member.root.traverse((object) => {
      if (isEvidenceBodyMesh(object, member.root, member.gun) && object.visible) {
        box.union(new THREE.Box3().setFromObject(object));
      }
    });
    return box;
  };
  for (const entry of representatives) {
    const { weapon, member, parent, position, quaternion, scale } = entry;
    const supportY = interior.floorAt(
      member.root.position.x, member.root.position.z, member.root.position.y,
    );
    assert.ok(Number.isFinite(supportY), `${weapon} representative has no rendered support beneath him`);
    const gap = visibleBodyBox(member).min.y - supportY;
    assert.ok(Math.abs(gap) <= 0.005,
      `${weapon} fallen body is ${(gap * 1000).toFixed(1)} mm off the gallery finish`);
    assert.equal(member.gun.visible, false, `${weapon} stayed visible on the fallen rig`);
    assert.equal(member.gun.parent, parent, `${weapon} was not returned to its original hand mount`);
    assert.deepEqual(member.gun.position.toArray(), position, `${weapon} local position changed`);
    assert.deepEqual(member.gun.quaternion.toArray(), quaternion, `${weapon} local rotation changed`);
    assert.deepEqual(member.gun.scale.toArray(), scale, `${weapon} local scale changed`);
  }

  const pistol = representatives[0];
  const downSnapshot = ensemble.snapshot();
  assert.equal(ensemble.revive(pistol.member.id), true);
  assert.equal(pistol.member.figure.pose, 'stand');
  assert.equal(pistol.member.gun.visible, true);
  assert.equal(pistol.member.gun.parent, pistol.parent,
    'revive did not preserve the original weapon mount');
  assert.equal(ensemble.restore(downSnapshot), true);
  assert.equal(pistol.member.figure.pose, 'fallen');
  assert.equal(pistol.member.gun.visible, false);
  assert.equal(pistol.member.gun.parent, pistol.parent,
    'checkpoint restore detached the hidden weapon from its hand');
});

test('the LITTLE_FRIEND tableau gives fallen Eric, his blood and the live guard clear gallery space', () => {
  const scene = new THREE.Scene();
  const grounds = buildMansionGrounds(scene);
  const interior = buildMansionInterior(grounds.shell);
  scene.add(grounds.root, interior.root);
  const colliders = [...grounds.colliders, ...interior.colliders];
  const damage = new MansionDamageState({ colliders, state: 'under_attack' });
  const matrix = new FactionMatrix();
  const ensemble = buildSiegeEnsemble({
    scene, damage, matrix, groundAt: mansionGroundAt(grounds, interior),
  });
  const eric = ensemble.members.get('eric');
  const guard = ensemble.members.get('guard_1');

  assert.deepEqual(eric.posts.LITTLE_FRIEND,
    { x: 7.65, y: 6, z: 50.4, lookX: 2.9, lookZ: 48.8 },
    'Eric is still staged against the east partition instead of the clear gallery bay');
  assert.deepEqual(guard.posts.LITTLE_FRIEND,
    { x: 4, y: 6, z: 49, lookX: 4.97948729479092, lookZ: 52.796 },
    'the flinching guard is still swallowed by the stair rail/newel silhouette');

  ensemble.stage('LITTLE_FRIEND');
  eric.actor.applyHit({ amount: 9999, attacker: { faction: FACTIONS.CARTEL }, matrix });
  ensemble.update(0.1, { colliders, hostiles: [] });
  for (let step = 0; step < 8; step++) ensemble.update(0.1, { colliders, hostiles: [] });
  ensemble.noteImpact(guard.root.position.clone(), 0.1);
  guard.businessLeft = 30;
  scene.updateMatrixWorld(true);

  const bodyBox = (member) => {
    const result = new THREE.Box3();
    member.root.traverse((object) => {
      if (isEvidenceBodyMesh(object, member.root, member.gun)) {
        result.union(new THREE.Box3().setFromObject(object));
      }
    });
    return result;
  };
  const ericBody = bodyBox(eric);
  const guardBody = bodyBox(guard);
  const guardSupportY = interior.floorAt(
    guard.root.position.x, guard.root.position.z, guard.root.position.y,
  );
  assert.ok(Math.abs(guardBody.min.y - guardSupportY) <= 0.005,
    `the guard's crouched flinch floats ${guardBody.min.y - guardSupportY} m above its runner`);
  assert.deepEqual({
    legL: guard.figure.parts.legL.rotation.x,
    legR: guard.figure.parts.legR.rotation.x,
    shinL: guard.figure.parts.shinL.rotation.x,
    shinR: guard.figure.parts.shinR.rotation.x,
  }, { legL: -0.72, legR: -0.58, shinL: 1.24, shinR: 1.05 },
  'the impact reaction returned to a full-height lean instead of a grounded crouch');
  assert.equal(guard.figure.parts.body.position.y, -0.5,
    'the crouched guard raised his upper body back over straight-leg height');
  const eastPartition = new THREE.Box3().setFromObject(
    interior.root.getObjectByName('east-partition-front-solid'),
  );
  assert.ok(ericBody.distanceToPoint(eastPartition.clampPoint(
    ericBody.getCenter(new THREE.Vector3()), new THREE.Vector3(),
  )) >= 1.2,
  'Eric still reads as one black mass with the east partition');
  assert.ok(ericBody.distanceToPoint(guardBody.clampPoint(
    ericBody.getCenter(new THREE.Vector3()), new THREE.Vector3(),
  )) >= 0.35,
  'the fallen body and live guard no longer have readable negative space');
  const firingStep = KEEP_CLEAR.find(({ label }) => label.includes('balcony bay'));
  const firingStepVolume = new THREE.Box3(
    new THREE.Vector3(firingStep.x0, 5.5, firingStep.z0),
    new THREE.Vector3(firingStep.x1, 8.5, firingStep.z1),
  );
  const guardGun = new THREE.Box3().setFromObject(guard.gun);
  for (const [name, box] of [
    ['Eric', ericBody], ['guard', guardBody], ['guard carbine', guardGun],
  ]) {
    assert.equal(box.intersectsBox(firingStepVolume), false,
      `${name} intrudes into the player's firing-step approach`);
  }

  const bloodBox = new THREE.Box3().setFromObject(eric.bloodPool);
  const bloodSize = bloodBox.getSize(new THREE.Vector3());
  const bodySize = ericBody.getSize(new THREE.Vector3());
  const bloodToBodyPlanArea = (bloodSize.x * bloodSize.z) / (bodySize.x * bodySize.z);
  assert.ok(bloodToBodyPlanArea >= 0.7 && bloodToBodyPlanArea <= 1.1,
    `the blood/body plan-area ratio is ${bloodToBodyPlanArea.toFixed(3)} `
      + `(blood ${bloodSize.x.toFixed(3)} x ${bloodSize.z.toFixed(3)}, `
      + `body ${bodySize.x.toFixed(3)} x ${bodySize.z.toFixed(3)}; readable stain, not giant field)`);
  const bloodEdge = eric.bloodPool.getObjectByName('siege-eric-blood-edge');
  assert.ok(bloodEdge?.isMesh, 'Eric has no local absorbent edge separating blood from the red runner');
  assert.equal(bloodEdge.userData.memberId, 'eric', 'the readable edge is not owned by Eric');
  assert.equal(bloodEdge.userData.collider, false, 'the blood readability layer became collision geometry');
  assert.equal(bloodEdge.material.map, eric.bloodPool.material.map,
    'the local edge no longer follows Eric\'s irregular blood texture');
  assert.ok(bloodEdge.scale.x === 1 && bloodEdge.material.roughness >= 0.95
      && bloodEdge.material.emissiveIntensity === 0,
  'Eric\'s edge is not a dark absorbent underlay');
});

test('the authored gallery practicals win the full production light budget throughout the alarm cycle', () => {
  assert.equal(typeof siegeNight.scoreSiegeLight, 'function',
    'the light scheduler has no auditable world-space score');
  const mainSource = fs.readFileSync(
    new URL('../src/mansion/siege/main.js', import.meta.url), 'utf8',
  );
  assert.match(mainSource, /scoreSiegeLight\(entry\.light, camera\.position/,
    'the live scheduler still ranks nested lights by local coordinates');

  const scene = new THREE.Scene();
  const grounds = buildMansionGrounds(scene);
  const interior = buildMansionInterior(grounds.shell);
  scene.add(grounds.root, interior.root);
  const colliders = [...grounds.colliders, ...interior.colliders];
  const damage = new MansionDamageState({ colliders, state: 'under_attack' });
  const localLights = [];
  /* Match production construction order and candidate population exactly:
   * the nine pulsing emergency fittings and three attack accents register
   * before the dressing.  Leaving the night rig out concealed the real
   * renderer result at the final evidence eye. */
  const night = siegeNight.buildSiegeNight({
    damage, registerLight: (light) => localLights.push(light),
  });
  scene.add(night.root);
  const dressing = buildSiegeDressing({
    damage, grounds, interior, registerLight: (light) => localLights.push(light),
  });
  scene.add(dressing.root);
  createAttackerPool({
    scene, damage, matrix: new FactionMatrix(),
    registerLight: (light) => localLights.push(light),
  });
  mountArmory({
    parent: scene,
    system: {},
    interaction: { register() {} },
    racks: interior.props.basement.armoryRacks,
    addLight: (light) => localLights.push(light),
  });
  scene.updateMatrixWorld(true);

  const worklamp = dressing.props.firingStep.lamp;
  assert.ok(worklamp.intensity >= 24 && worklamp.distance >= 15,
    `the local practical is only intensity ${worklamp.intensity}, range ${worklamp.distance}`);
  const taskFlood = dressing.props.defenceStations.taskFlood?.light;
  assert.ok(taskFlood?.isPointLight, 'the real dressing did not register its gallery task flood');
  assert.deepEqual(
    { intensity: taskFlood.intensity, distance: taskFlood.distance, decay: taskFlood.decay },
    { intensity: 18, distance: 10, decay: 2 },
    'the supported battery flood is no longer a bounded local practical',
  );
  const authoredView = authoredWorklampEvidenceView();
  const evidenceSupportY = interior.floorAt(
    authoredView.x, authoredView.z, authoredView.y,
  );
  assert.ok(Math.abs(evidenceSupportY - 6.02) <= 1e-9,
    'the light-budget proof no longer resolves the real gallery parquet under the shot');
  const exactEvidenceEye = new THREE.Vector3(
    authoredView.x, evidenceSupportY + 1.02, authoredView.z,
  );
  const camera = exactEvidenceEye;
  assert.ok(camera.distanceTo(new THREE.Vector3(7, 7.04, 52.2)) <= 1e-12,
    `the authored crouched shot eye drifted to ${camera.toArray()}`);
  const lightPool = [...grounds.lights, ...interior.lights, ...localLights];
  /* 268 = the 256 the fixture pinned on 2026-08-13 plus the nine picture
   * sconces the dynasty-art pass hung with the owner's ten Mansion
   * paintings (living room 1, billiard lounge 1, gallery dynasty wall 4,
   * conference 1, Lou's office 2 — see MansionInterior.js) plus the strip
   * lamp over the pump shotgun's rack, mounted 2026-08-15 when the basement
   * got a mount point for the seventh catalogue weapon (`armoryRacks`),
   * plus the two picture sconces the 2026-08-19 art pass hung over the
   * foyer savior portrait and the gallery heaven roster. */
  assert.equal(lightPool.length, 268,
    'the regression fixture drifted from the real house + night + dressing + attacker + armory pool');
  const practicals = [
    ['rail worklamp', worklamp],
    ['north-console battery flood', taskFlood],
  ];
  const assertLocalPracticalsActive = (phase) => {
    const ranked = lightPool
      .map((light) => ({ light, score: siegeNight.scoreSiegeLight(light, camera) }))
      .sort((left, right) => left.score - right.score);
    for (let index = 0; index < ranked.length; index++) {
      ranked[index].light.visible = index < 10;
    }
    for (const [name, light] of practicals) {
      const rank = ranked.findIndex((entry) => entry.light === light) + 1;
      assert.ok(rank > 0 && rank <= 10,
        `${phase}: ${name} rank ${rank}/${lightPool.length} makes production lightStatus.visible false`);
      assert.equal(light.visible, true,
        `${phase}: production's ten-light visibility assignment switched off ${name}`);
    }
  };

  night.alarm.phase = 0;
  night.update(0);
  assert.ok(night.posts.every(({ light }) => light.intensity === 0),
    'the alarm-off sample did not exercise zero-intensity semantics');
  assert.ok(night.posts.every(({ light }) => (
    siegeNight.scoreSiegeLight(light, camera) === Infinity
  )), 'an extinguished alarm fitting still consumed a production light slot');
  assertLocalPracticalsActive('alarm off');
  let sawPositiveAlarm = false;
  const alarmSamples = 32;
  for (let sample = 1; sample <= alarmSamples; sample++) {
    night.update(night.alarm.period / alarmSamples);
    const peak = Math.max(...night.posts.map(({ light }) => light.intensity));
    sawPositiveAlarm ||= peak > 0;
    assertLocalPracticalsActive(`alarm sample ${sample}/${alarmSamples} at intensity ${peak.toFixed(6)}`);
  }
  assert.equal(sawPositiveAlarm, true, 'the alarm-cycle regression never sampled a live alarm light');

  const lightWorld = worklamp.getWorldPosition(new THREE.Vector3());
  const taskWorld = taskFlood.getWorldPosition(new THREE.Vector3());
  assert.ok(taskWorld.distanceTo(new THREE.Vector3(4.65, 7.22, 52.3)) <= 1e-12,
    `the supported battery flood moved to ${taskWorld.toArray()}`);
  for (const [name, subject] of [
    ['Eric', new THREE.Vector3(7.641214239265063, 6, 50.18914174236149)],
    ['guard', new THREE.Vector3(4.209999999999996, 6, 49)],
  ]) {
    const distance = lightWorld.distanceTo(subject);
    assert.ok(distance <= worklamp.distance / 2,
      `${name} is ${distance.toFixed(3)} m from the authored practical`);
    const taskDistance = taskWorld.distanceTo(subject);
    const cameraVector = camera.clone().sub(subject);
    const taskVector = taskWorld.clone().sub(subject);
    const facingCosine = cameraVector.dot(taskVector)
      / (cameraVector.length() * taskVector.length());
    assert.ok(taskDistance <= 4,
      `${name} is ${taskDistance.toFixed(3)} m from the north-console task flood`);
    assert.ok(facingCosine > 0,
      `${name}'s task flood is behind the camera-facing hemisphere (${facingCosine.toFixed(3)})`);
  }
});

test('the authored worklamp evidence camera is legal and frames every real subject volume', () => {
  const { source, x, y, z, targetX, targetY, targetZ } = authoredWorklampEvidenceView();
  const restoreIndex = source.indexOf(
    'siege.ensemble.restore(window.__mansionTargetBaseline)',
  );
  const restageIndex = source.indexOf(
    "siege.ensemble.stage('LITTLE_FRIEND')", restoreIndex,
  );
  const settleIndex = source.indexOf(
    'for (let step = 0; step < 8; step++) siege.tick(0.1)', restoreIndex,
  );
  assert.ok(restoreIndex >= 0 && restageIndex > restoreIndex && restageIndex < settleIndex,
    'the shot restores BRIEFING positions but never retargets the LITTLE_FRIEND posts before settling');

  const scene = new THREE.Scene();
  const grounds = buildMansionGrounds(scene);
  const interior = buildMansionInterior(grounds.shell);
  scene.add(grounds.root, interior.root);
  const colliders = [...grounds.colliders, ...interior.colliders];
  const damage = new MansionDamageState({ colliders, state: 'clean' });
  const dressing = buildSiegeDressing({ damage, grounds, interior });
  scene.add(dressing.root);
  const ensemble = buildSiegeEnsemble({
    scene, damage, matrix: new FactionMatrix(), groundAt: mansionGroundAt(grounds, interior),
  });
  damage.apply('under_attack');
  ensemble.stage('BRIEFING');
  const baseline = ensemble.snapshot();
  ensemble.stage('AFTERMATH');
  assert.equal(ensemble.restore(baseline), true,
    'the browser shot could not restore its clean BRIEFING baseline');
  ensemble.stage('LITTLE_FRIEND');

  /* This is the real settle sequence the browser shot runs before it creates
   * the injury. Let both people reach their authored posts while the attackers
   * are absent, then leave the live movement system in charge. */
  const eric = ensemble.members.get('eric');
  const guard = ensemble.members.get('guard_1');
  /* Let the live movement system reach the LITTLE_FRIEND posts before the
   * diagnostic injury. Otherwise the verifier would down Eric halfway out of
   * the BRIEFING mark and never exercise the authored clear-bay tableau. */
  eric.actor.incapacitated = false;
  eric.actor.health = eric.actor.maxHealth;
  eric.downed = false;
  /* `shot()` teleports to the authored floor datum, then the production
   * Player snaps to the rendered gallery parquet just north of the runner
   * before crouching. The parquet is 20 mm above the room datum, so the
   * screenshot eye is 7.04. */
  const evidenceSupportY = interior.floorAt(x, z, y);
  assert.ok(Math.abs(evidenceSupportY - 6.02) <= 1e-9,
    'the exact production evidence point no longer stands on the gallery parquet');
  const evidenceEye = new THREE.Vector3(x, evidenceSupportY + 1.02, z);
  const evidencePlayer = makePlayer(evidenceEye.x, evidenceEye.y, evidenceEye.z);
  const tick = (seconds, step = 1 / 60) => {
    for (let elapsed = 0; elapsed < seconds; elapsed += step) {
      ensemble.update(Math.min(step, seconds - elapsed), {
        player: evidencePlayer, colliders, hostiles: [],
      });
    }
  };
  for (let frame = 0; frame < 8; frame++) tick(0.1);
  eric.actor.health = 1;
  tick(0.1);
  tick(0.8);
  ensemble.noteImpact(guard.root.position.clone(), 0.1);
  guard.businessLeft = 30;
  tick(0.05);
  guard.businessLeft = 30;
  scene.updateMatrixWorld(true);

  const expectedEric = new THREE.Vector3(7.641214239265063, 6, 50.18914174236149);
  const expectedGuard = new THREE.Vector3(4.209999999999996, 6, 49);
  assert.ok(eric.root.position.distanceTo(expectedEric) <= 1e-9,
    `exact restored shot chain settled Eric at ${eric.root.position.toArray()}`);
  assert.ok(guard.root.position.distanceTo(expectedGuard) <= 1e-9,
    `exact restored shot chain settled guard at ${guard.root.position.toArray()}`);
  const guardYaw = THREE.MathUtils.euclideanModulo(
    guard.root.rotation.y + Math.PI, Math.PI * 2,
  ) - Math.PI;
  assert.ok(guardYaw >= 0.18 && guardYaw <= 0.22,
    `the guard's supported carbine is not turned broadside (${guardYaw} rad normalized)`);
  assert.ok(Math.abs(guard.figure.parts.body.rotation.x - 0.64) <= 1e-12,
    `the live guard no longer ducks behind the supported carbine (${guard.figure.parts.body.rotation.x} rad)`);
  assert.ok(eric.figure.parts.legL.rotation.z <= -0.4,
    `Eric's near leg was folded back under the far leg (${eric.figure.parts.legL.rotation.z} rad)`);
  const worklampLight = dressing.props.firingStep.lamp;
  assert.deepEqual(
    { intensity: worklampLight.intensity, distance: worklampLight.distance, decay: worklampLight.decay },
    { intensity: 24, distance: 16, decay: 2 },
    'the mount correction must retain the existing local practical power and decay',
  );
  const worklampLightWorld = worklampLight.getWorldPosition(new THREE.Vector3());
  for (const [name, member] of [['Eric', eric], ['guard', guard]]) {
    const distance = worklampLightWorld.distanceTo(member.root.position);
    assert.ok(distance <= 4,
      `${name} settles ${distance.toFixed(3)} m from the real worklamp light `
      + `at ${worklampLightWorld.toArray().map((value) => value.toFixed(3))}`);
  }
  assert.equal(dressing.props.firingStep.colliders.length, 3,
    'relocating the supported practical must not add a route collider');
  const ericSupportY = interior.floorAt(
    eric.root.position.x, eric.root.position.z, eric.root.position.y,
  );
  assert.ok(Number.isFinite(ericSupportY), 'exact restored shot has no rendered support under Eric');
  const visibleEricBody = new THREE.Box3();
  eric.root.traverse((object) => {
    if (isEvidenceBodyMesh(object, eric.root, eric.gun) && object.visible) {
      visibleEricBody.union(new THREE.Box3().setFromObject(object));
    }
  });
  const bodyFloorGap = visibleEricBody.min.y - ericSupportY;
  assert.ok(Math.abs(bodyFloorGap) <= 0.005,
    `exact restored shot leaves Eric ${(bodyFloorGap * 1000).toFixed(1)} mm above the visible floor`);
  const positiveColliderContacts = colliders.map((box, index) => ({
    index,
    overlap: new THREE.Box3().copy(visibleEricBody).intersect(box),
  })).filter(({ overlap }) => !overlap.isEmpty()).map(({ index, overlap }) => ({
    index,
    size: overlap.getSize(new THREE.Vector3()),
  })).filter(({ size }) => size.x > 1e-6 && size.y > 1e-6 && size.z > 1e-6);
  assert.deepEqual(positiveColliderContacts, [],
    `exact player-yield body intersects real colliders: ${JSON.stringify(positiveColliderContacts)}`);

  const worklamp = dressing.props.firingStep.group.getObjectByName('siege.step.worklamp');
  const camera = new THREE.PerspectiveCamera(68, 1920 / 1080, 0.08, 260);
  const eye = evidenceEye;
  camera.position.copy(eye);
  camera.lookAt(Number(targetX), Number(targetY), Number(targetZ));
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();

  const shown = (object) => {
    for (let current = object; current; current = current.parent) {
      if (current.visible === false) return false;
    }
    return true;
  };
  const projection = (root, { bodyRoot = null, weaponRoot = null } = {}) => {
    const points = [];
    const local = new THREE.Vector3();
    root.traverse((object) => {
      const selected = bodyRoot
        ? isEvidenceBodyMesh(object, bodyRoot, weaponRoot) : object.isMesh === true;
      if (!selected || !shown(object)) return;
      const position = object.geometry?.getAttribute?.('position');
      if (!position?.count) return;
      for (let index = 0; index < position.count; index++) {
        local.fromBufferAttribute(position, index);
        if (object.isSkinnedMesh) object.applyBoneTransform(index, local);
        points.push(local.clone().applyMatrix4(object.matrixWorld).project(camera));
      }
    });
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const zs = points.map((point) => point.z);
    return {
      intersects: Math.min(...xs) <= 1 && Math.max(...xs) >= -1
        && Math.min(...ys) <= 1 && Math.max(...ys) >= -1,
      fullyInside: points.every((point) => Math.abs(point.x) <= 1
        && Math.abs(point.y) <= 1 && point.z >= -1 && point.z <= 1),
      ndc: {
        minX: Math.min(...xs), maxX: Math.max(...xs),
        minY: Math.min(...ys), maxY: Math.max(...ys),
      },
    };
  };
  const visibleRayMeshes = [];
  scene.traverse((object) => {
    if (object.isMesh && object.geometry && shown(object)) visibleRayMeshes.push(object);
  });
  const paintedAlphaAtUv = (seed, inputUv) => {
    let state = (Math.trunc(seed) || 1) >>> 0;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x100000000;
    };
    const pixelX = inputUv.x * 128;
    const pixelY = (1 - inputUv.y) * 128;
    let alpha = 0;
    for (let index = 0; index < 26; index += 1) {
      random(); random(); random();
      const sourceAlpha = 0.22 + random() * 0.5;
      const centreX = 64 + (random() - 0.5) * 74;
      const centreY = 64 + (random() - 0.5) * 74;
      const radiusX = 6 + random() * 34;
      const radiusY = 5 + random() * 30;
      const angle = random() * 3;
      const dx = pixelX - centreX;
      const dy = pixelY - centreY;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const localX = cos * dx + sin * dy;
      const localY = -sin * dx + cos * dy;
      /* Stay a full texel inside each analytical ellipse so Canvas edge
       * antialiasing cannot turn this deterministic probe into a false hit. */
      if ((localX / radiusX) ** 2 + (localY / radiusY) ** 2 <= 0.94) {
        alpha = sourceAlpha + alpha * (1 - sourceAlpha);
      }
    }
    return alpha;
  };
  const paintedBloodScreenSamples = (mesh) => {
    const candidates = [];
    const local = new THREE.Vector3();
    const point = new THREE.Vector3();
    for (let row = 0; row < 128; row += 1) {
      for (let column = 0; column < 128; column += 1) {
        const u = (column + 0.5) / 128;
        const v = (row + 0.5) / 128;
        if (paintedAlphaAtUv(mesh.userData.seed, { x: u, y: v })
            * mesh.material.opacity < 0.5) continue;
        local.set(u - 0.5, v - 0.5, 0);
        point.copy(local).applyMatrix4(mesh.matrixWorld).project(camera);
        candidates.push({ u, v, x: point.x, y: point.y });
      }
    }
    return {
      samples: selectEvidenceTextureSamples(candidates, 25),
      candidateCount: candidates.length,
    };
  };
  const blood = eric.bloodPool;
  const visibility = (
    root, proof, { bodyRoot = null, weaponRoot = null, paintedBlood = false } = {},
  ) => {
    const targetMeshes = new Set();
    root.traverse((object) => {
      const selected = bodyRoot
        ? isEvidenceBodyMesh(object, bodyRoot, weaponRoot) : object.isMesh === true;
      if (selected && shown(object)) targetMeshes.add(object);
    });
    const painted = paintedBlood ? paintedBloodScreenSamples(root) : null;
    const samples = painted ? painted.samples
      : Array.from({ length: 25 }, (_, index) => ({
        x: THREE.MathUtils.lerp(
          proof.ndc.minX, proof.ndc.maxX, (index % 5 + 0.5) / 5,
        ),
        y: THREE.MathUtils.lerp(
          proof.ndc.minY, proof.ndc.maxY, (Math.floor(index / 5) + 0.5) / 5,
        ),
      }));
    assert.equal(samples.length, 25, 'the real blood texture has fewer than 25 painted texels');
    const raycaster = new THREE.Raycaster();
    const ndcPoint = new THREE.Vector2();
    let targetHits = 0;
    for (const sample of samples) {
      ndcPoint.set(sample.x, sample.y);
      raycaster.setFromCamera(ndcPoint, camera);
      const first = raycaster.intersectObjects(visibleRayMeshes, false).find((hit) => {
        if (!shown(hit.object)) return false;
        if (hit.object === blood) {
          return paintedAlphaAtUv(blood.userData.seed, hit.uv) * blood.material.opacity >= 0.5;
        }
        return isEvidenceOpaqueIntersection(hit);
      });
      if (first && targetMeshes.has(first.object)) targetHits += 1;
    }
    return {
      sampleCount: 25,
      targetHits,
      hitRatio: targetHits / 25,
      sampleMode: paintedBlood ? 'painted-texture' : 'uniform-grid',
      paintedCandidateCount: painted?.candidateCount ?? null,
    };
  };
  const ericBody = projection(eric.root, { bodyRoot: eric.root, weaponRoot: eric.gun });
  const ericBlood = projection(blood);
  const guardBody = projection(guard.root, { bodyRoot: guard.root, weaponRoot: guard.gun });
  const guardGun = projection(guard.gun);
  const lampProof = projection(worklamp);
  ericBody.visibility = visibility(eric.root, ericBody, {
    bodyRoot: eric.root, weaponRoot: eric.gun,
  });
  ericBlood.visibility = visibility(blood, ericBlood, { paintedBlood: true });
  guardBody.visibility = visibility(guard.root, guardBody, {
    bodyRoot: guard.root, weaponRoot: guard.gun,
  });
  guardGun.visibility = visibility(guard.gun, guardGun);
  lampProof.visibility = visibility(worklamp, lampProof);
  const partVisibility = {};
  for (const [name, member, partRoot] of [
    ['eric.head', eric, eric.figure.parts.head],
    ['eric.torso', eric, eric.figure.parts.torso],
    ['eric.armLeft', eric, eric.figure.parts.armL],
    ['eric.armRight', eric, eric.figure.parts.armR],
    ['eric.legLeft', eric, eric.figure.parts.legL],
    ['eric.legRight', eric, eric.figure.parts.legR],
    ['guard.head', guard, guard.figure.parts.head],
    ['guard.torso', guard, guard.figure.parts.torso],
    ['guard.armLeft', guard, guard.figure.parts.armL],
    ['guard.armRight', guard, guard.figure.parts.armR],
    ['guard.legLeft', guard, guard.figure.parts.legL],
    ['guard.legRight', guard, guard.figure.parts.legR],
  ]) {
    const partProof = projection(partRoot, {
      bodyRoot: member.root, weaponRoot: member.gun,
    });
    partVisibility[name] = visibility(partRoot, partProof, {
      bodyRoot: member.root, weaponRoot: member.gun,
    }).targetHits;
  }
  for (const [name, targetHits] of Object.entries(partVisibility)) {
    assert.ok(targetHits >= 1,
      `${name} has no first-hit body sample in the real worklamp camera: ${JSON.stringify(partVisibility)}`);
  }
  const composition = {
    eric: {
      body: ericBody,
      blood: ericBlood,
      bloodOwner: blood.userData.memberId,
      bloodOpacity: blood.material.opacity,
      bloodEmissiveRed: blood.material.emissive.r * blood.material.emissiveIntensity,
    },
    guard: {
      body: guardBody,
      gun: guardGun,
    },
    worklamp: lampProof,
  };
  const wholeSubjectHits = [
    ericBody.visibility.targetHits,
    ericBlood.visibility.targetHits,
    guardBody.visibility.targetHits,
    guardGun.visibility.targetHits,
    lampProof.visibility.targetHits,
  ];
  assert.ok(wholeSubjectHits.every((hits, index) => hits >= [5, 5, 5, 3, 3][index]),
    `the production player-yield transform lost a real first-hit proof: ${wholeSubjectHits}`);
  assert.equal(ericBlood.visibility.paintedCandidateCount, 6016,
    'the settled stain no longer exposes the same real alpha-painted sample field');
  const capsuleContacts = colliders.filter((box) => {
    if (eye.y + 0.05 < box.min.y || eye.y - 1.02 > box.max.y) return false;
    const nearestX = Math.max(box.min.x, Math.min(eye.x, box.max.x));
    const nearestZ = Math.max(box.min.z, Math.min(eye.z, box.max.z));
    return (eye.x - nearestX) ** 2 + (eye.z - nearestZ) ** 2 < 0.3 ** 2;
  });
  assert.equal(capsuleContacts.length, 0, 'the evidence camera starts in solid geometry');
  const promptDistance = eye.distanceTo(eric.root.position);
  /* Bind the evidence camera to the live 2.4 m revive radius while allowing
   * it to clear the 1.8 m floor stain instead of certifying a near-plane crop. */
  assert.ok(promptDistance <= 2.4,
    `the production player context puts Eric ${promptDistance.toFixed(6)} m from the prompt camera`);
  assert.equal(evaluateWorklampComposition(composition), true,
    `the evidence camera clips or shrinks a required subject: ${JSON.stringify({
      diagnostic: diagnoseWorklampComposition(composition), composition,
    })}`);
});

test('blood-pool rollover never steals the pool under somebody still down', () => {
  const { scene, damage, matrix } = harness();
  const ensemble = buildSiegeEnsemble({ scene, damage, matrix });
  ensemble.stage('WAVE_ONE');
  const lou = ensemble.members.get('lou');
  const booski = ensemble.members.get('booski');
  const knockDown = (member) => {
    member.actor.applyHit({ amount: 9999, attacker: { faction: FACTIONS.CARTEL }, matrix });
    ensemble.update(0.1, {});
  };

  knockDown(lou);
  for (let fall = 0; fall < ensemble.members.size; fall++) {
    knockDown(booski);
    if (fall < ensemble.members.size - 1) assert.equal(ensemble.revive('booski'), true);
  }
  for (let i = 0; i < 8; i++) ensemble.update(0.1, {});
  scene.updateMatrixWorld(true);

  const visiblePools = [];
  scene.traverse((object) => {
    if (object.visible && object.name?.startsWith(BLOOD_POOL_NAME)) visiblePools.push(object);
  });
  assert.ok(visiblePools.length <= ensemble.members.size,
    `${visiblePools.length} blood meshes escaped a ${ensemble.members.size}-body bound`);
  for (const { id } of ensemble.downed()) {
    const member = ensemble.members.get(id);
    const owned = visiblePools.filter((pool) => pool.userData.memberId === id);
    assert.equal(owned.length, 1,
      `${id} is still down but owns ${owned.length} visible blood pools after rollover`);
    const bodyBox = new THREE.Box3().setFromObject(member.root);
    const poolBox = new THREE.Box3().setFromObject(owned[0]);
    assert.ok(poolBox.max.x >= bodyBox.min.x && poolBox.min.x <= bodyBox.max.x
      && poolBox.max.z >= bodyBox.min.z && poolBox.min.z <= bodyBox.max.z,
    `${id}'s surviving blood pool was recycled under somebody else`);
  }
});

test('he bleeds, he asks for help, and he is still alive four minutes later', () => {
  const { scene, damage, matrix } = harness();
  const ensemble = buildSiegeEnsemble({ scene, damage, matrix });
  ensemble.stage('WAVE_TWO');
  const eric = ensemble.members.get('eric');
  eric.actor.applyHit({ amount: 9999, attacker: { faction: FACTIONS.CARTEL }, matrix });
  for (let i = 0; i < 2400; i++) ensemble.update(0.1, {});
  const down = ensemble.downed().find((m) => m.id === 'eric');
  assert.ok(down, 'he got up on his own, which nothing in the mission does');
  assert.ok(down.seconds > 200, `only ${down.seconds.toFixed(0)}s of bleeding`);
  assert.equal(eric.actor.incapacitated, false,
    'four minutes on the floor killed him -- there are no deaths in this mission');
});

test('picking him up costs him most of his health and can happen twice', () => {
  const { scene, damage, matrix } = harness();
  const ensemble = buildSiegeEnsemble({ scene, damage, matrix });
  ensemble.stage('WAVE_ONE');
  const rippin = ensemble.members.get('rippinflow');
  rippin.actor.applyHit({ amount: 9999, attacker: { faction: FACTIONS.CARTEL }, matrix });
  ensemble.update(0.1, {});
  assert.equal(ensemble.revive('rippinflow'), true);
  assert.equal(ensemble.downed().length, 0);
  assert.ok(rippin.actor.health > 1 && rippin.actor.health < rippin.actor.maxHealth * 0.5,
    `back up on ${rippin.actor.health} of ${rippin.actor.maxHealth} -- that is not a cost`);
  assert.equal(ensemble.revive('rippinflow'), false, 'revived a man who is standing');
  /* And he can go down again. */
  rippin.actor.applyHit({ amount: 9999, attacker: { faction: FACTIONS.CARTEL }, matrix });
  ensemble.update(0.1, {});
  assert.equal(ensemble.downed().length, 1);
  ensemble.revive('rippinflow');
  assert.equal(rippin.revivedCount, 2);
});

test('cast weapons stow for hands-busy and downed poses, then return on revive', () => {
  const { scene, colliders, damage, matrix } = harness();
  const ensemble = buildSiegeEnsemble({ scene, damage, matrix });
  ensemble.stage('BRIEFING');
  const lou = ensemble.members.get('lou');
  ensemble.update(0.1, { player: makePlayer(), colliders, hostiles: [] });
  assert.equal(lou.businessKey, 'phone');
  assert.equal(lou.gun.visible, false, 'Lou is holding a pistol in his phone hand');

  ensemble.stage('WAVE_ONE');
  const booski = ensemble.members.get('booski');
  assert.equal(booski.gun.visible, true, 'a standing defender entered the fight unarmed');
  booski.actor.applyHit({ amount: 9999, attacker: { faction: FACTIONS.CARTEL }, matrix });
  ensemble.update(0.1, {});
  assert.equal(booski.figure.pose, 'fallen');
  assert.equal(booski.gun.visible, false, 'a fallen man still has a gun welded to his forearm');

  assert.equal(ensemble.revive('booski'), true);
  assert.equal(booski.figure.pose, 'stand');
  assert.equal(booski.gun.visible, true, 'revive did not return his fighting stance and weapon');
});

test('a checkpoint does not stand a bleeding man up', () => {
  const { scene, damage, matrix } = harness();
  const ensemble = buildSiegeEnsemble({ scene, damage, matrix });
  ensemble.stage('WAVE_ONE');
  const shubes = ensemble.members.get('shubenator');
  shubes.actor.applyHit({ amount: 9999, attacker: { faction: FACTIONS.CARTEL }, matrix });
  /* `update` clamps a step to 0.1 s, so four seconds is forty calls and not
   * one -- passing 4 advances the world by a tenth of a second. */
  for (let i = 0; i < 40; i++) ensemble.update(0.1, {});
  const snap = ensemble.snapshot();
  ensemble.revive('shubenator');
  assert.equal(ensemble.downed().length, 0);
  ensemble.restore(snap);
  const back = ensemble.downed();
  assert.equal(back.length, 1, 'the restore left him on his feet');
  assert.equal(back[0].id, 'shubenator');
  assert.ok(back[0].seconds >= 3.9, 'the bleed clock restarted');
});

test('nobody who died before the mansion is standing in it', () => {
  /* The campaign's dead, by name and by mission:
   *   Willy   executed in the cabin of a boat in NO WAKE, Day 3.
   *   Billy   Billy HotDog, victim of the closed-party incident.
   *   Aubbie  executed at the end of PROJECT SILENT SQUATCH, Day 5 8:10 PM --
   *           "Eliminate Aubbie" is the objective -- six hours before this
   *           siege starts. He handed out magazines in this file until
   *           2026-08-13, when the owner's playtest caught him alive.
   * The mansion arc is after all three. Each is asserted by name against the
   * live ensemble, the survival flag AND the roster ids, so a future recast
   * cannot smuggle one back in under any of the three doors. */
  const { scene, damage, matrix } = harness();
  const ensemble = buildSiegeEnsemble({ scene, damage, matrix });
  ensemble.stage('BRIEFING');
  const DEAD = ['willy', 'billy', 'billy_hotdog', 'aubbie'];
  for (const id of DEAD) {
    assert.equal(ensemble.members.has(id), false, `${id} is in the mansion again`);
    assert.equal(SURVIVES_THE_SIEGE.includes(id), false,
      `${id} is dead and cannot also be mission-protected`);
  }
  for (const member of ensemble.members.values()) {
    for (const id of DEAD) {
      assert.ok(!member.id.includes(id) && !member.name.toLowerCase().includes(id.split('_')[0]),
        `${member.id} (${member.name}) resembles the dead ${id}`);
    }
  }
});

test('every role in waves.js has a behaviour plan', () => {
  assert.deepEqual(Object.keys(ROLE_PLAN).sort(), Object.keys(ROLES).sort());
});

test('no role shares the whole behaviour of another', () => {
  const shape = (plan) => JSON.stringify([
    plan.weapon, plan.tactic, plan.standoff, plan.speed, plan.cover,
    plan.route, plan.climbs, plan.pinsLanding, plan.reposition, plan.accuracy,
    plan.burst.min, plan.burst.max, plan.burst.pause,
  ]);
  const seen = new Map();
  for (const [id, plan] of Object.entries(ROLE_PLAN)) {
    const key = shape(plan);
    assert.equal(seen.has(key), false,
      `${id} behaves identically to ${seen.get(key)}`);
    seen.set(key, id);
  }
  /* And every one of the eight tactics is its own word -- two roles with the
   * same tactic differing only in a standoff would pass the check above and
   * still read as the same man on a staircase. */
  const tactics = Object.values(ROLE_PLAN).map((plan) => plan.tactic);
  assert.equal(new Set(tactics).size, tactics.length, 'eight tactics, eight roles');
});

test('the roles that matter behave the way the brief describes them', () => {
  /* Not a restatement of the table: the four sentences the brief writes by
   * hand, each asserted against the plan that has to produce it. */
  const { shotgun, suppressor, flanker, armored, gunner, rifle } = ROLE_PLAN;
  /* "the shotgun rusher closes" */
  assert.ok(shotgun.standoff < 10);
  assert.ok(shotgun.speed > rifle.speed);
  assert.equal(shotgun.cover, 0, 'and does not stop for cover');
  /* "the suppressor sits at range and pins the landing" */
  assert.ok(suppressor.standoff >= 26);
  assert.equal(suppressor.pinsLanding, true);
  assert.equal(suppressor.climbs, false, 'he does not push the flights');
  /* "the flanker uses a second route" */
  assert.notEqual(flanker.route, rifle.route);
  /* "the armored one soaks" */
  assert.ok(ROLES.armored.armor > ROLES.rifle.armor * 4);
  assert.ok(armored.cover < rifle.cover, 'he does not need cover');
  /* the belt-fed gun sets up rather than advancing */
  assert.ok(gunner.burst.max > rifle.burst.max * 3);
  assert.equal(gunner.climbs, false);
});

test('a wave uses both stair flights and more than one route', () => {
  const { pool } = harness();
  const orders = releaseWave(pool, 'two');
  const climbSides = new Set();
  const routes = new Set();
  for (const order of orders) {
    const entry = pool.entry(order.id);
    routes.add(entry.plan.route);
    for (const point of entry.path) {
      if (point.kind !== 'climb') continue;
      climbSides.add(point.x < 0 ? 'west' : 'east');
    }
  }
  assert.ok(routes.size >= 2, 'the wave comes in on more than one route');
  assert.deepEqual([...climbSides].sort(), ['east', 'west'],
    'and pushes both flights of the horseshoe');
});

/**
 * Every leg of a route, checked against the floor plan.
 *
 * THE OLD VERSION OF THIS TEST MEASURED LENGTHS. It asserted that no single
 * leg was longer than the house is wide, which is a proxy for "he did not
 * walk through a wall" and a bad one: the two legs that actually went through
 * walls were 7.3 m and 5.4 m and both passed. This walks the rooms instead.
 *
 * The rule, and it is the whole rule: consecutive waypoints are either in the
 * same room, or the segment between them passes through exactly one opening
 * the house really has, and that opening joins those two rooms.
 */
function assertRouteIsWalkable(id, points, from) {
  let previous = { x: from.x, z: from.z, y: from.y ?? null };
  let previousRoom = roomAt(previous);
  assert.ok(previousRoom, `${id} starts at (${previous.x}, ${previous.z}) which is in no room`);
  for (const point of points) {
    const room = roomAt(point);
    assert.ok(room,
      `${id} walks to (${point.x.toFixed(1)}, ${point.z.toFixed(1)}) which is in no room`);
    const crossing = crossingFor(previous, point);
    if (room === previousRoom) {
      assert.equal(crossing, null,
        `${id} stays in ${room} but crosses ${crossing?.opening.id}`);
    } else {
      assert.ok(crossing,
        `${id} goes ${previousRoom} -> ${room} through solid wall`
        + ` at (${point.x.toFixed(1)}, ${point.z.toFixed(1)})`);
      assert.ok(crossing.opening.rooms.includes(previousRoom)
        && crossing.opening.rooms.includes(room),
      `${id} goes ${previousRoom} -> ${room} through ${crossing.opening.id},`
        + ` which joins ${crossing.opening.rooms.join(' and ')}`);
    }
    previous = point;
    previousRoom = room;
  }
}

test('no leg of any route is a straight line through a room he is not in', () => {
  const { pool } = harness();
  for (const wave of ['one', 'two']) {
    for (const order of releaseWave(pool, wave)) {
      const entry = pool.entry(order.id);
      assertRouteIsWalkable(order.id, entry.path, order.staging);
    }
  }
  /* And the two authored encounters, which are routed by the same graph. */
  for (const encounter of Object.values(ENCOUNTERS)) {
    for (const member of encounter.members) {
      const entry = pool.spawn(member);
      assertRouteIsWalkable(member.id, entry.path, STAGING[member.staging]);
    }
  }
});

test('the foyer encounter holds its reveal posts until the player reaches the ground floor', () => {
  const { pool } = harness();
  const entries = ENCOUNTERS.foyer.members.map((order) => pool.spawn(order));
  assert.ok(entries.every((entry) => entry.order.holdUntil === 'player_ground_floor'));

  const starts = new Map(entries.map((entry) => [entry.id, {
    position: entry.root.position.clone(),
    pathLength: entry.path.length,
  }]));
  const player = makePlayer(0, -1.14, 55);
  const context = { player, colliders: [], alive: [], playerDamageScale: 0 };
  for (let i = 0; i < 360; i++) pool.update(1 / 60, context);
  for (const entry of entries) {
    assert.equal(entry.holdReleased, false, `${entry.id} released while the player was below`);
    assert.ok(entry.root.position.distanceTo(starts.get(entry.id).position) < 1e-9,
      `${entry.id} left the authored reveal post while the player was below`);
    assert.equal(entry.path.length, starts.get(entry.id).pathLength,
      `${entry.id} consumed its route before the reveal`);
  }

  /* This is the armed-checkpoint shape: spawned in the armory, still held. */
  const armedSnapshot = pool.snapshot();
  assert.ok(armedSnapshot.attackers.every((record) => record.holdReleased === false));

  player.position.y = GROUND_Y + 1.66;
  for (let i = 0; i < 90; i++) pool.update(1 / 60, context);
  assert.ok(entries.every((entry) => entry.holdReleased),
    'the real ground-floor player did not release the foyer encounter');
  assert.ok(entries.some((entry) => (
    entry.root.position.distanceTo(starts.get(entry.id).position) > 0.25
  )), 'the released encounter did not resume its authored routes');
  const contactSnapshot = pool.snapshot();
  assert.ok(contactSnapshot.attackers.every((record) => record.holdReleased === true));

  pool.restore(armedSnapshot);
  assert.ok(entries.every((entry) => entry.holdReleased === false),
    'restoring the armed checkpoint did not restore the pre-reveal hold');
  pool.update(1 / 60, context);
  assert.ok(entries.every((entry) => entry.holdReleased === true),
    'a ground-floor player did not release a restored armed checkpoint');

  pool.restore(contactSnapshot);
  player.position.y = -1.14;
  pool.update(1 / 60, context);
  assert.ok(entries.every((entry) => entry.holdReleased === true),
    'returning downstairs re-armed a hold that had already released');

  const legacyArmed = structuredClone(armedSnapshot);
  for (const record of legacyArmed.attackers) delete record.holdReleased;
  pool.restore(legacyArmed);
  pool.update(1 / 60, context);
  assert.ok(entries.every((entry) => entry.holdReleased === false),
    'a legacy armed snapshot released actors still standing at their reveal posts');
});

test('every route ends up where the player is standing, or holding the room under him', () => {
  /* THE DIRECTION, AS AN ASSERTION. "I want the main fight to take place from
   * the balcony as they come up the stairs or come in the front door." A man
   * whose route stops in the forecourt is a man the player never fights. */
  const { pool } = harness();
  const orders = [...releaseWave(pool, 'one'), ...releaseWave(pool, 'two')];
  const ends = new Map();
  for (const order of orders) {
    const entry = pool.entry(order.id);
    const last = entry.path[entry.path.length - 1];
    assert.ok(last, `${order.id} has no route at all`);
    const room = roomAt(last);
    ends.set(room, (ends.get(room) ?? 0) + 1);
    assert.ok(['gallery', 'balcony', 'stair_west', 'stair_east', 'foyer'].includes(room),
      `${order.id} (${order.role.id}) stops in ${room}`);
  }
  const onTheLanding = (ends.get('gallery') ?? 0) + (ends.get('balcony') ?? 0);
  assert.ok(onTheLanding >= 8,
    `only ${onTheLanding} of ${orders.length} get all the way onto the landing`);
});

test('the two flanks come through glass, and nobody else breaks anything', () => {
  /* Derived from the nav graph's own opening table rather than from a guess
   * about the geometry -- the guess once reported the rear service DOOR as a
   * broken window, and the glass owner would have shattered a door. */
  const { pool } = harness();
  const orders = [...releaseWave(pool, 'one'), ...releaseWave(pool, 'two')];
  const breaking = [];
  for (const order of orders) {
    const entry = pool.entry(order.id);
    for (const point of entry.path) {
      if (point.breaks) breaking.push({ id: order.id, staging: order.staging.id, opening: point.breaks.id });
    }
  }
  assert.equal(breaking.length, 4, 'four men break in, and it is the flank group');
  assert.deepEqual([...new Set(breaking.map((b) => b.staging))].sort(),
    ['living_west', 'lounge_bay']);
  assert.deepEqual([...new Set(breaking.map((b) => b.opening))].sort(),
    ['bayEastSouth', 'trophyWestSouth']);
  /* Both panes, not one twice: the group is supposed to arrive on two flanks
   * at once so the player cannot answer it by turning through ninety degrees. */
  assert.equal(new Set(breaking.map((b) => b.opening)).size, 2);
});

test('nobody on a route shares a waypoint with anybody else', () => {
  /* The failure the probe caught: eight men standing inside each other on
   * one tread, because every man on a route got the identical waypoint
   * list. TWO things fix it and they fix different halves -- `occupy()`
   * reserves the destination so no two men STOP in the same place, and the
   * lane spreads the transit so no two men WALK the same line. This is the
   * first half; `laneWaypoints` is asserted separately below. */
  const { pool } = harness();
  const orders = [...releaseWave(pool, 'one'), ...releaseWave(pool, 'two')];
  const seen = new Map();
  for (const order of orders) {
    const entry = pool.entry(order.id);
    const last = entry.path[entry.path.length - 1];
    if (!last) continue;
    assert.equal(seen.has(last.anchor), false,
      `${order.id} was sent to ${last.anchor}, which ${seen.get(last.anchor)} already holds`);
    seen.set(last.anchor, order.id);
    const key = `${last.x.toFixed(2)},${last.z.toFixed(2)}`;
    assert.equal([...seen.keys()].filter((k) => k === key).length, 0,
      `${order.id} ends on the same spot as somebody else`);
    /* And the graph did not have to fall back to sharing a spot: the house
     * has more places to stand than the whole staircase defence has men,
     * even with both waves alive at once, which the mission never does. */
    assert.equal(entry.sharedDestination, false,
      `${order.id} was doubled up on ${last.anchor} -- the landing has run out of anchors`);
  }
});

test('a man who dies gives his place on the landing back', () => {
  /* Without this the whole gallery ends up reserved by corpses and the second
   * half of wave two stops on the flights. */
  const { pool } = harness();
  const orders = releaseWave(pool, 'two');
  const first = pool.entry(orders[0].id);
  const held = first.destination;
  assert.ok(held, 'he reserved somewhere');
  assert.equal(pool.navigator.graph.capture()[held], first.id);
  pool.registerHit(first.figure.parts.head, 9999, 0.4);
  assert.equal(pool.navigator.graph.capture()[held], undefined,
    'and gave it up when he went down');
});

test('the lane spreads a group across the leg rather than along it', () => {
  /* The old lane offset was applied to x, always. A group walking east down
   * the lounge therefore spread along its own direction of travel and
   * arrived as a single file of one. The offset is now perpendicular to the
   * leg, which is the difference between five men abreast and five men in a
   * queue. */
  /* Use a deliberately broad gallery post. The rear foyer arch lanes are now
   * zero on purpose: furniture leaves a single measured centreline there. */
  const fromAnchor = anchorById('gallery_centre');
  const from = { x: fromAnchor.x, z: fromAnchor.z, y: fromAnchor.y };
  const spread = [-1, 0, 1].map((laneT) => laneWaypoints(
    ['gallery_east'], { from, laneT },
  ));
  const [low, mid, high] = spread.map((points) => points[0]);
  const spreadVector = new THREE.Vector2(high.x - low.x, high.z - low.z);
  const legVector = new THREE.Vector2(
    anchorById('gallery_east').x - anchorById('gallery_centre').x,
    anchorById('gallery_east').z - anchorById('gallery_centre').z,
  ).normalize();
  assert.ok(spreadVector.length() > 1.8,
    `only ${spreadVector.length().toFixed(2)}m apart`);
  assert.ok(Math.abs(spreadVector.clone().normalize().dot(legVector)) < 0.01,
    'the lane spread is not perpendicular to the travel leg');
  const anchor = anchorById('gallery_east');
  assert.ok(Math.abs(mid.z - anchor.z) < 0.01, 'the middle lane is the anchor itself');
  assert.ok(Math.abs(mid.x - anchor.x) < 0.01);
});

test('a laned leg still goes through the doorway the plain one does', () => {
  /* THE LANE CAN MISS THE DOOR. The offset is perpendicular to the leg, so a
   * man on the outside lane crosses a wall a metre to one side of where the
   * centre lane crosses it -- and a metre to one side of a 2.8 m pane is the
   * mullion. Caught for real: the outermost of the four flank attackers
   * crossed the billiard bay's east elevation 0.28 m north of the glass, so
   * three men broke a window and the fourth walked through the frame.
   *
   * Checked for every edge that leaves a room, at every lane, because the
   * front door is 3.2 m wide and the same arithmetic applies to it. */
  for (const laneT of [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1]) {
    for (const anchor of ANCHORS) {
      for (const id of anchor.neighbors) {
        const other = anchorById(id);
        if (anchor.room === other.room) continue;
        const plain = crossingFor(
          { x: anchor.x, z: anchor.z, y: anchor.y },
          { x: other.x, z: other.z, y: other.y },
        );
        if (!plain) continue;
        /* Approached from the far side, so BOTH ends carry a lane offset --
         * which is the case that drifts, and the case a real path produces. */
        const from = {
          x: anchor.x - (other.x - anchor.x),
          z: anchor.z - (other.z - anchor.z),
          y: anchor.y,
        };
        const [a, b] = laneWaypoints([anchor.id, id], { from, laneT });
        const laned = crossingFor(a, b);
        assert.equal(laned?.opening.id, plain.opening.id,
          `lane ${laneT} on ${anchor.id} -> ${id} misses ${plain.opening.id}`
          + ` (it crosses at ${laned?.opening.id ?? 'nothing'})`);
      }
    }
  }
});

test('a laned waypoint never leaves the room its anchor is in', () => {
  /* The lane is what stops eight men standing inside each other and it is
   * also the one thing that can push a waypoint out of the room it was
   * authored in -- 0.55 m of spread on the portico is 0.55 m toward a wall
   * 0.4 m away. */
  for (const laneT of [-1, -0.5, 0, 0.5, 1]) {
    for (const anchor of ANCHORS) {
      for (const neighbour of anchor.neighbors) {
        const [point] = laneWaypoints([neighbour], {
          from: { x: anchor.x, z: anchor.z, y: anchor.y }, laneT,
        });
        assert.equal(roomAt(point), point.room,
          `lane ${laneT} on ${anchor.id} -> ${neighbour} lands in ${roomAt(point)}`);
      }
    }
  }
});

test('the eight roles actually fire differently over a minute', () => {
  const { colliders, pool } = harness();
  releaseWave(pool, 'two');
  const player = makePlayer();
  for (let i = 0; i < 60 * 60; i++) {
    pool.update(1 / 60, { player, colliders, alive: [] });
    if (player.actor.health <= 10) {
      player.actor.health = 100;
      player.actor.incapacitated = false;
    }
  }
  const byRole = new Map();
  for (const entry of pool.all()) {
    byRole.set(entry.role.id, (byRole.get(entry.role.id) ?? 0) + entry.roundsFired);
  }
  /* The belt-fed gun and the shotgun rusher are the two extremes on the
   * table, and if they are firing the same number of rounds a minute the
   * roles are decoration. */
  assert.ok(byRole.get('gunner') > byRole.get('shotgun') * 2,
    `gunner ${byRole.get('gunner')} vs shotgun ${byRole.get('shotgun')}`);
  assert.ok(byRole.get('smg') > 0 && byRole.get('rifle') > 0);
});

test('a protected story line holds hostile reports without freezing the assault', () => {
  const { colliders, pool } = harness();
  const shooter = pool.spawn({
    id: 'hero-line-rifle', role: ROLES.rifle, staging: STAGING.front_steps,
  });
  shooter.root.position.set(0, 1.2, 40);
  shooter.floorY = 1.2;
  shooter.path.length = 0;
  shooter.goal.copy(shooter.root.position);
  shooter.root.rotation.y = 0;
  shooter.awareness = 1;
  shooter.sinceThink = 1;
  const player = makePlayer(0, 1.2, 48);
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    for (let frame = 0; frame < 240; frame++) {
      pool.update(1 / 60, {
        player, colliders, alive: [], holdFire: true, playerDamageScale: 0,
      });
    }
    assert.equal(shooter.targetVisible, true, 'the protected line froze perception');
    assert.equal(shooter.roundsFired, 0, 'a hostile gun talked over the protected line');
    for (let frame = 0; frame < 360 && shooter.roundsFired === 0; frame++) {
      pool.update(1 / 60, {
        player, colliders, alive: [], holdFire: false, playerDamageScale: 0,
      });
    }
  } finally {
    Math.random = originalRandom;
  }
  assert.ok(shooter.roundsFired > 0, 'combat did not resume when the line released the floor');
});

/* ================================================================== */
/* THE RAIL IS COVER, NOT IMMUNITY                                      */
/* ================================================================== */

test('a round from the foyer floor is stopped by the rail and still suppresses', () => {
  const { colliders, pool } = harness();
  const orders = releaseWave(pool, 'one');
  /* The balustrade along the balcony's south edge -- MansionInterior.BALCONY
   * runs z 45.2..48 and cantilevers south off the gallery, so the rail the
   * player crouches behind is its SOUTHERN lip, not the gallery line. */
  colliders.push(new THREE.Box3(
    new THREE.Vector3(-4, 5.9, 45.0), new THREE.Vector3(4, 7.05, 45.5),
  ));
  const player = makePlayer(0, 7.0, 46.3);
  const shooter = pool.entry(orders[0].id);
  /* One man, on the marble, in the middle of the foyer, with a clean line at
   * the player's head and the rail exactly between them. Deterministic
   * geometry, so this is a fact about cover rather than a dice roll. */
  let hits = 0;
  for (let i = 0; i < 60 * 30; i++) {
    for (const entry of pool.all()) {
      entry.active = entry === shooter;
      entry.root.visible = entry === shooter;
    }
    shooter.root.position.set(0, 1.2, 40);
    shooter.floorY = 1.2;
    shooter.path.length = 0;
    pool.update(1 / 60, {
      player, colliders, alive: [], onPlayerHit: () => { hits++; },
    });
  }
  assert.ok(shooter.roundsFired > 20, `he only fired ${shooter.roundsFired}`);
  assert.ok(player.suppression.misses > 0, 'he is being shot at');
  assert.equal(hits, 0, 'and not one round got through the rail');
  assert.equal(player.actor.health, player.actor.maxHealth);
});

test('an attacker who has climbed the flight can shoot over the rail', () => {
  /* The other half of the same sentence: the rail is cover, not immunity. A
   * man who took the stairs is on the player's side of the thing he walked
   * past, and the landing is not a safe box. */
  const { colliders, pool } = harness();
  const orders = releaseWave(pool, 'one');
  /* Somebody is actually routed up a flight in the first place. */
  const climbers = orders
    .map((order) => pool.entry(order.id))
    .filter((entry) => entry.path.some((point) => point.kind === 'climb'));
  assert.ok(climbers.length >= 4, `only ${climbers.length} men push the flights`);

  colliders.push(new THREE.Box3(
    new THREE.Vector3(-4, 5.9, 45.0), new THREE.Vector3(4, 7.05, 45.5),
  ));
  const player = makePlayer(0, 7.0, 46.3);
  const shooter = climbers[0];
  /* Counted through the pool's own hit callback rather than read off the
   * player's health at the end -- topping him back up so the fight keeps
   * running is exactly the thing that can leave him at full health having
   * been shot six times. */
  let hits = 0;
  for (let i = 0; i < 60 * 30; i++) {
    for (const entry of pool.all()) {
      entry.active = entry === shooter;
      entry.root.visible = entry === shooter;
    }
    /* Put him where the climb route ends: on the gallery, north of the rail
     * and on the same side of it as the player. */
    shooter.root.position.set(0, 6.0, 48.6);
    shooter.floorY = 6.0;
    shooter.path.length = 0;
    pool.update(1 / 60, {
      player, colliders, alive: [], onPlayerHit: () => { hits++; },
    });
    if (player.actor.health <= 10) {
      player.actor.health = 100;
      player.actor.incapacitated = false;
    }
  }
  assert.ok(shooter.roundsFired > 20, `he only fired ${shooter.roundsFired}`);
  assert.ok(hits > 0, 'and the landing is not a safe box');
});

test('close misses share one rate-limited bullet-whiz voice', () => {
  const { colliders, pool } = harness();
  const entry = pool.spawn({
    id: 'whiz-gunner', role: ROLES.gunner, staging: STAGING.front_steps,
  });
  entry.root.position.set(0, 1.2, 40);
  entry.floorY = 1.2;
  entry.path.length = 0;
  entry.root.rotation.y = 0;
  entry.awareness = 1;
  entry.sinceThink = 1;

  const player = makePlayer(0, 1.2, 48);
  player.suppression = {
    value: 0,
    misses: 0,
    noteNearMiss() { this.misses++; return this.value; },
  };
  let elapsed = 0;
  const whizzes = [];
  const audio = {
    hasSample: () => true,
    play: (cue) => {
      if (cue === 'heist.bullet.whiz') whizzes.push(elapsed);
    },
  };

  const random = Math.random;
  Math.random = () => 0.5; // Fires, misses by exactly the whiz threshold.
  try {
    for (let i = 0; i < 180; i++) {
      elapsed = i / 60;
      pool.update(1 / 60, {
        player, colliders, alive: [], audio, playerDamageScale: 0,
      });
    }
  } finally {
    Math.random = random;
  }

  assert.ok(entry.roundsFired >= 6, `only ${entry.roundsFired} rounds exercised the limiter`);
  assert.ok(whizzes.length >= 2, `only ${whizzes.length} whiz cue exercised the cooldown recovery`);
  assert.ok(whizzes.length < entry.roundsFired,
    `${whizzes.length} whizzes were emitted for ${entry.roundsFired} rounds`);
  for (let i = 1; i < whizzes.length; i++) {
    assert.ok(whizzes[i] - whizzes[i - 1] >= 0.2,
      `whizzes were only ${(whizzes[i] - whizzes[i - 1]).toFixed(3)}s apart`);
  }
});

test('blocked rounds end on the obstruction while clean misses end beside the player', () => {
  const shoot = ({ player, boxes }) => {
    const { pool } = harness();
    const entry = pool.spawn({
      id: 'endpoint-gunner', role: ROLES.gunner, staging: STAGING.front_steps,
    });
    entry.root.position.set(0, 1.2, 40);
    entry.floorY = 1.2;
    entry.path.length = 0;
    entry.root.rotation.y = 0;
    entry.awareness = 1;
    entry.sinceThink = 1;
    for (let i = 0; i < 240 && !entry.lastShot; i++) {
      pool.update(1 / 60, {
        player, colliders: boxes, alive: [], playerDamageScale: 0,
      });
    }
    assert.ok(entry.lastShot, 'the deterministic shooter never fired');
    return { entry, shot: entry.lastShot };
  };

  const rail = new THREE.Box3(
    new THREE.Vector3(-4, 5.9, 45), new THREE.Vector3(4, 7.05, 45.5),
  );
  const random = Math.random;
  Math.random = () => 0.5; // Gunner fires; its normal accuracy roll misses.
  let blocked;
  let missed;
  try {
    blocked = shoot({ player: makePlayer(0, 7, 46.3), boxes: [rail] });
    missed = shoot({ player: makePlayer(0, 1.2, 48), boxes: [] });
  } finally {
    Math.random = random;
  }

  assert.equal(blocked.shot.areaFire, true, 'cover did not select fixed-position suppression');
  assert.equal(blocked.shot.blocked, true, 'the rail was not recorded as the obstruction');
  assert.equal(blocked.shot.onTarget, false, 'an area-fire round became a player hit');
  /* Shared fire control traces the ACTUAL dispersed round, not the centre aim
   * ray. Extend the recorded trajectory through the rail and independently
   * recover the same first contact. */
  const direction = blocked.shot.end.clone().sub(blocked.shot.origin).normalize();
  const beyondRail = blocked.shot.end.clone().addScaledVector(direction, 10);
  const obstruction = segmentBlocked(blocked.shot.origin, beyondRail, [rail]);
  assert.ok(obstruction, 'the recorded blocked shot has no matching obstruction');
  const expectedStop = obstruction.point;
  assert.ok(blocked.shot.end.distanceTo(expectedStop) <= 1e-6,
    `blocked endpoint missed the rail intersection by ${blocked.shot.end.distanceTo(expectedStop)}m`);

  assert.equal(missed.shot.blocked, false);
  assert.equal(missed.shot.onTarget, false);
  assert.ok(missed.shot.end.distanceTo(missed.entry.aimPoint) >= 0.45,
    `miss endpoint stayed on the player (${missed.shot.end.distanceTo(missed.entry.aimPoint)}m)`);
});

test('segmentBlocked finds the wall between two points and not the empty air', () => {
  const box = new THREE.Box3(
    new THREE.Vector3(-1, 0, 4), new THREE.Vector3(1, 3, 4.4),
  );
  const a = new THREE.Vector3(0, 1.5, 0);
  const b = new THREE.Vector3(0, 1.5, 10);
  const hit = segmentBlocked(a, b, [box]);
  assert.ok(hit, 'the wall is in the way');
  assert.ok(Math.abs(hit.distance - 4) < 0.05);
  assert.equal(segmentBlocked(a, new THREE.Vector3(8, 1.5, 0), [box]), null);
  /* A man standing against his own cover is not blinded by it. */
  assert.equal(segmentBlocked(new THREE.Vector3(0, 1.5, 4.2), b, [box]), null);
  /* Near cover is not inside cover. The old 45 cm exemption let this muzzle
   * shoot straight through the wall it was merely standing beside. */
  const nearWall = segmentBlocked(new THREE.Vector3(0, 1.5, 3.56), b, [box]);
  assert.ok(nearWall, 'a shooter beside the wall ignored the whole wall');
});

/* ================================================================== */
/* LOCATION-BASED DAMAGE                                                */
/* ================================================================== */

test('a headshot is lethal once, while chest and limb hits retain scaled damage', () => {
  const { pool } = harness();
  const orders = releaseWave(pool, 'one');
  const damageAt = (part) => {
    const entry = pool.spawn(orders[0]);
    const resolved = pool.registerHit(entry.figure.parts[part], 30, 0.3);
    return resolved[0].result.damage;
  };
  const head = damageAt('head');
  const chest = damageAt('body');
  const leg = damageAt('legL');
  assert.ok(head > chest, `head ${head} vs chest ${chest}`);
  assert.ok(chest > leg, `chest ${chest} vs leg ${leg}`);
  assert.ok(head >= chest * HIT_ZONES.head);
});

test('the weakest sidearm kills every attacker role with one headshot', () => {
  const { pool } = harness();
  for (const [id, role] of Object.entries(ROLES)) {
    const entry = pool.spawn({ id: `head-${id}`, role, staging: STAGING.front_steps });
    const resolved = pool.registerHit(entry.figure.parts.head, 28, 0.16);
    assert.equal(resolved[0]?.zone, 'head', `${id} lost its hit zone`);
    assert.equal(resolved[0]?.result?.fatal, true, `${id} survived a headshot`);
    assert.equal(entry.actor.incapacitated, true, `${id} stayed active after a headshot`);
  }
});

test('a complete WeaponSystem impact keeps its exact pre-fall Located hit record', () => {
  const { scene, pool } = harness();
  const entry = pool.spawn({
    id: 'located-head', role: ROLES.armored, staging: STAGING.front_steps,
  });
  scene.updateMatrixWorld(true);
  const anchor = entry.figure.parts.head;
  const expectedLocal = new THREE.Vector3(0.035, 0.08, -0.025);
  const point = anchor.localToWorld(expectedLocal.clone());
  const origin = point.clone().add(new THREE.Vector3(0.2, 0.05, 4));
  const direction = point.clone().sub(origin).normalize();
  const impact = {
    point,
    normal: direction.clone().negate(),
    origin,
    direction,
    distance: origin.distanceTo(point),
    object: anchor,
    weapon: 'pistol9',
    damage: 28,
    penetration: 0.16,
  };

  const resolved = pool.registerHit(impact);
  assert.equal(resolved.length, 1, 'the Siege return stopped being a one-contact array');
  const hit = resolved[0];
  assert.equal(entry.root.userData.combatant, entry);
  assert.equal(hit.impact.object, anchor);
  assert.equal(hit.impact.weapon, 'pistol9');
  assert.equal(hit.impact.penetration, 0.16);
  assert.ok(hit.impact.point.distanceTo(point) < 1e-12);
  assert.ok(hit.impact.origin.distanceTo(origin) < 1e-12);
  assert.ok(hit.impact.direction.distanceTo(direction) < 1e-12);
  assert.ok(hit.anchorLocalPoint.distanceTo(expectedLocal) < 1e-9,
    'the fatal pose moved the stored body-local contact');
  assert.equal(hit.anchor, anchor);
  assert.equal(hit.hitAnchor, anchor);
  assert.equal(hit.spatterAnchor, anchor);
  assert.equal(hit.result.fatal, true);
  assert.equal(Object.isFrozen(hit.impact), true);
  assert.equal(Object.isFrozen(hit.impact.point), true);
});

test('the Located player-impact path preserves the pool faction matrix', () => {
  const { matrix, pool } = harness();
  const entry = pool.spawn({
    id: 'matrix-protected', role: ROLES.rifle, staging: STAGING.front_steps,
  });
  matrix.canDamage = () => false;
  const health = entry.actor.health;
  const [hit] = pool.registerHit(entry.figure.parts.body, 9999, 0.4);
  assert.equal(hit.actor, entry.actor, 'the compatibility hit exposed an actor facade');
  assert.equal(hit.result.applied, false);
  assert.equal(hit.result.reason, 'protected');
  assert.equal(entry.actor.health, health);
});

test('the pool snapshots shared fire-control state with flat checkpoint fallback', () => {
  const { pool } = harness();
  pool.fireControl.whizCooldown = 0.18;
  const snapshot = JSON.parse(JSON.stringify(pool.snapshot()));
  assert.deepEqual(snapshot.fireControl, { version: 1, whizCooldown: 0.18 });
  assert.equal(snapshot.whizCooldown, 0.18);

  pool.fireControl.whizCooldown = 0;
  assert.equal(pool.restore(snapshot), true);
  assert.equal(pool.fireControl.whizCooldown, 0.18);

  delete snapshot.fireControl;
  snapshot.whizCooldown = 0.11;
  assert.equal(pool.restore(snapshot), true);
  assert.equal(pool.fireControl.whizCooldown, 0.11);
});

test('walls block target acquisition until the target is genuinely visible', () => {
  const { colliders, pool } = harness();
  const entry = pool.spawn({ id: 'los-rifle', role: ROLES.rifle, staging: STAGING.front_steps });
  entry.root.position.set(0, 1.2, 40);
  entry.floorY = 1.2;
  entry.path.length = 0;
  entry.root.rotation.y = 0;
  const player = makePlayer(0, 1.2, 54);
  const wall = new THREE.Box3(
    new THREE.Vector3(-3, 1.1, 46), new THREE.Vector3(3, 4, 46.5),
  );
  colliders.push(wall);
  for (let i = 0; i < 120; i++) pool.update(1 / 60, { player, colliders, alive: [] });
  assert.equal(entry.targetVisible, false);
  assert.equal(entry.target, null, 'the target was acquired through the wall');
  assert.equal(entry.roundsFired, 0);

  colliders.length = 0;
  for (let i = 0; i < 120; i++) pool.update(1 / 60, { player, colliders, alive: [] });
  assert.equal(entry.targetVisible, true);
  assert.equal(entry.target?.actor, player.actor);
});

test('an attacker does not acquire a clear target outside his field of view', () => {
  const { colliders, pool } = harness();
  const entry = pool.spawn({ id: 'fov-rifle', role: ROLES.rifle, staging: STAGING.front_steps });
  entry.root.position.set(0, 1.2, 40);
  entry.floorY = 1.2;
  entry.path.length = 0;
  entry.goal.copy(entry.root.position);
  entry.root.rotation.y = Math.PI;
  const player = makePlayer(0, 1.2, 54);

  for (let i = 0; i < 60; i++) pool.update(1 / 60, { player, colliders, alive: [] });
  assert.equal(entry.targetVisible, false);
  assert.equal(entry.target, null, 'the target behind him became a live target');
  assert.equal(entry.memory, 0, 'a never-seen target created last-seen memory');

  entry.root.rotation.y = 0;
  for (let i = 0; i < 30 && !entry.targetVisible; i++) {
    pool.update(1 / 60, { player, colliders, alive: [] });
  }
  assert.equal(entry.targetVisible, true, 'turning toward the target did not acquire it');
  assert.equal(entry.target?.actor, player.actor);
  const saved = pool.snapshot().attackers.find((record) => record.id === entry.id);
  assert.deepEqual(saved.perception.lastSeen, entry.lastSeen.toArray());
  assert.doesNotThrow(() => JSON.stringify(saved.perception));
});

test('an attacker must turn and settle his weapon on the aim point before firing', () => {
  const { scene, colliders, pool } = harness();
  const entry = pool.spawn({ id: 'aim-rifle', role: ROLES.rifle, staging: STAGING.front_steps });
  entry.root.position.set(0, 1.2, 40);
  entry.floorY = 1.2;
  entry.path.length = 0;
  entry.root.rotation.y = 0;
  entry.awareness = 1;
  entry.sinceThink = 1;
  const player = makePlayer(0, 4.2, 48);
  pool.update(1 / 60, { player, colliders, alive: [] });
  assert.equal(entry.targetVisible, true, 'the target was not acquired before the turn test');
  entry.root.rotation.y = Math.PI;
  entry.weaponAim.reset();
  entry.aimFrame = null;
  entry.lastShot = null;
  for (let i = 0; i < 240 && !entry.lastShot; i++) {
    pool.update(1 / 60, { player, colliders, alive: [] });
  }
  assert.ok(entry.lastShot, 'the aligned attacker never fired');
  assert.equal(entry.aimAligned, true, 'the public alignment gate did not admit the shot');
  assert.ok(entry.lastShot.aimError <= 0.14, `shot fired ${entry.lastShot.aimError} rad off target`);
  assert.ok(Math.abs(entry.aimPitch) > 0.05, 'the weapon stayed level at an elevated target');

  /* The values above used to describe only the actor root and a synthetic
   * pitch. The rendered gun could still be thirteen degrees off while the
   * tracer began in his chest. Read the catalog model's authored muzzle and
   * local -Z bore so the regression covers what the player actually sees. */
  scene.updateMatrixWorld(true);
  const renderedMuzzle = entry.gun.localToWorld(entry.gun.userData.muzzle.clone());
  const renderedBore = new THREE.Vector3(0, 0, -1)
    .applyQuaternion(entry.gun.getWorldQuaternion(new THREE.Quaternion()))
    .normalize();
  const towardAim = entry.aimPoint.clone().sub(renderedMuzzle).normalize();
  const renderedError = renderedBore.angleTo(towardAim);
  assert.ok(renderedError <= 0.14, `rendered bore fired ${renderedError} rad off target`);
  assert.ok(entry.lastShot.boreError <= 0.14,
    `shot record admitted a ${entry.lastShot.boreError} rad bore error`);
  /* `figure.update()` runs after the shot in the same pool tick and adds a
   * sub-millimetre breathing offset, so compare at visual rather than float
   * identity precision. */
  assert.ok(entry.lastShot.origin.distanceTo(renderedMuzzle) <= 1e-3,
    `tracer began ${entry.lastShot.origin.distanceTo(renderedMuzzle)}m from the rendered muzzle`);
});

test('authored movement slides against solid boxes and separates squadmates', () => {
  const { colliders, pool } = harness();
  const wall = new THREE.Box3(
    new THREE.Vector3(-2, 1.1, 44), new THREE.Vector3(2, 4, 45),
  );
  colliders.push(wall);
  const a = pool.spawn({ id: 'clip-a', role: ROLES.smg, staging: STAGING.front_steps });
  const b = pool.spawn({ id: 'clip-b', role: ROLES.smg, staging: STAGING.front_steps });
  for (const [entry, x] of [[a, -0.03], [b, 0.03]]) {
    entry.root.position.set(x, 1.2, 40);
    entry.floorY = 1.2;
    entry.path = [{ x: 0, y: 1.2, z: 50, anchor: 'test', kind: 'transit' }];
  }
  for (let i = 0; i < 240; i++) pool.update(1 / 60, { player: null, colliders, alive: [] });
  assert.ok(a.root.position.z <= wall.min.z - 0.29, `a crossed the wall to z ${a.root.position.z}`);
  assert.ok(b.root.position.z <= wall.min.z - 0.29, `b crossed the wall to z ${b.root.position.z}`);
  assert.ok(a.root.position.distanceTo(b.root.position) >= 0.48, 'the squadmates remained stacked');
});

test('squadmate congestion queues at a tight waypoint without destroying either route', () => {
  const { colliders, pool } = harness();
  const entries = Array.from({ length: 4 }, (_, index) => pool.spawn({
    id: `queue-${index}`, role: ROLES.smg, staging: STAGING.front_steps,
  }));
  for (const [index, entry] of entries.entries()) {
    entry.root.position.set(0, 1.2, 40 - index * 0.52);
    entry.floorY = 1.2;
    entry.path = [{
      x: 0, y: 1.2, z: 44, anchor: 'court_step_turn_west',
      kind: 'transit', arrival: 0.05,
    }];
  }

  for (let i = 0; i < 600; i++) pool.update(1 / 60, {
    player: null, colliders, alive: [],
  });

  assert.deepEqual(entries.map(({ recovered }) => recovered), [0, 0, 0, 0],
    'ordinary squad traffic was mistaken for a broken authored route');
  assert.ok(entries.some(({ path }) => path.length === 0), 'the head of the queue never arrived');
  assert.ok(entries.some(({ path }) => path.length === 1), 'the queue did not remain queued');
});

test('combat-only floor slabs do not stop a climber or trigger repeated route recovery', () => {
  const { pool } = harness();
  const entry = pool.spawn({ id: 'gallery-lip', role: ROLES.rifle, staging: STAGING.front_steps });
  entry.root.position.set(7.84, 5.76, 47.69);
  entry.floorY = 5.76;
  entry.goal.set(7.84, 6, 49.33);
  entry.path = [{
    x: 7.84, y: 6, z: 49.33, anchor: 'gallery_head_east', kind: 'climb',
  }];
  /* This is the shape of a combat floor: it must stop vertical bullets, but
   * its leading edge is not a wall a body walking onto the landing can see. */
  const galleryFloor = new THREE.Box3(
    new THREE.Vector3(-12, 5.7, 48), new THREE.Vector3(12, 6, 53),
  );
  entry.sinceThink = -1000;
  for (let i = 0; i < 240 && entry.path.length; i++) {
    pool.update(1 / 60, {
      player: null,
      colliders: [galleryFloor],
      movementColliders: [],
      alive: [],
    });
  }
  assert.equal(entry.path.length, 0, `climber stopped at z ${entry.root.position.z}`);
  assert.equal(entry.recovered, 0, 'a combat-only floor became a locomotion recovery');
});

test('siege blocked recovery starts at the reached anchor and is consumed once', () => {
  const navigator = new SiegeNavigator();
  navigator.enter('climber', 'steps_centre', 'east');
  const plan = navigator.plan('climber', 'gallery', { role: 'east' });
  assert.ok(plan?.destination?.startsWith('gallery'));

  const first = navigator.blocked('climber', 2.5, 'stair_east_high');
  assert.equal(first.recover, true);
  const second = navigator.blocked('climber', 1 / 60, 'stair_east_high');
  assert.deepEqual(second, { recover: false },
    'one obstruction emitted recovery again on the next frame');
  assert.ok((navigator.director.blockedFor.get('climber') ?? 0) < 0.02,
    'the consumed obstruction kept its multi-second timer');
});

test('peer congestion may consume only a non-final transit waypoint', () => {
  const { colliders, pool } = harness();
  const entries = ['transit', 'transit-peer', 'final', 'final-peer'].map((id) => (
    pool.spawn({ id, role: ROLES.smg, staging: STAGING.front_steps })
  ));
  const [transit, transitPeer, final, finalPeer] = entries;
  for (const [entry, x, z] of [
    [transit, 0, 40], [transitPeer, 0, 39.7],
    [final, 3, 40], [finalPeer, 3, 39.7],
  ]) {
    entry.root.position.set(x, 1.2, z);
    entry.floorY = 1.2;
    entry.goal.set(x, 1.2, 40.4);
  }
  transit.path = [
    { x: 0, y: 1.2, z: 40.4, anchor: 'tight-transit', arrival: 0.05 },
    { x: 0, y: 1.2, z: 44, anchor: 'final', arrival: 0.05 },
  ];
  final.path = [{ x: 3, y: 1.2, z: 40.4, anchor: 'final', arrival: 0.05 }];
  transitPeer.path = [];
  finalPeer.path = [];

  pool.update(1 / 60, { player: null, colliders, alive: [] });

  assert.equal(transit.path[0].anchor, 'final',
    'peer-separated actor did not clear a body-width transit queue');
  assert.equal(final.path[0].anchor, 'final',
    'peer congestion weakened a final destination arrival contract');
});

test('body hits interrupt aim and limb hits have tactical consequences', () => {
  const { pool } = harness();
  const entry = pool.spawn({ id: 'wounds', role: ROLES.rifle, staging: STAGING.front_steps });
  const readyArm = entry.figure.parts.armR.quaternion.clone();
  const chest = pool.registerHit(entry.figure.parts.body, 8, 0.1)[0];
  assert.equal(chest.zone, 'chest');
  assert.ok(entry.stagger > 0.3, 'the chest hit did not interrupt aim');
  let peakArmDeviation = 0;
  for (let i = 0; i < 40; i++) {
    pool.update(1 / 60, { player: null, colliders: [], alive: [] });
    peakArmDeviation = Math.max(
      peakArmDeviation,
      readyArm.angleTo(entry.figure.parts.armR.quaternion),
    );
  }
  assert.ok(peakArmDeviation <= 0.37,
    `stagger corkscrewed the weapon arm by ${peakArmDeviation} radians`);
  assert.ok(readyArm.angleTo(entry.figure.parts.armR.quaternion) < 1e-6,
    'the weapon arm did not recover its authored braced pose');

  pool.spawn({ id: 'wounds', role: ROLES.rifle, staging: STAGING.front_steps });
  const leg = pool.registerHit(entry.figure.parts.legL, 8, 0.1)[0];
  assert.equal(leg.part, 'leg');
  assert.ok(entry.legWound > 0, 'the leg hit did not slow movement');

  pool.spawn({ id: 'wounds', role: ROLES.rifle, staging: STAGING.front_steps });
  const arm = pool.registerHit(entry.figure.parts.armR, 8, 0.1)[0];
  assert.equal(arm.part, 'arm');
  assert.ok(entry.armWound > 0, 'the arm hit did not disturb accuracy');
});

test('a leg wound measurably slows the same attacker on the same route', () => {
  const { pool } = harness();
  const order = { id: 'leg-speed', role: ROLES.smg, staging: STAGING.front_steps };
  const travel = (wounded) => {
    const entry = pool.spawn(order);
    if (wounded) pool.registerHit(entry.figure.parts.legL, 8, 0.1);
    /* Isolate locomotion from the hit's separate stagger and suppression
     * reactions: this comparison is about the durable leg impairment. */
    entry.suppression.value = 0;
    entry.stagger = 0;
    entry.sinceMove = 0;
    entry.root.position.set(0, 1.2, 40);
    entry.floorY = 1.2;
    entry.path = [{ x: 0, y: 1.2, z: 60, anchor: 'speed', kind: 'transit' }];
    entry.goal.copy(entry.root.position);
    entry.sinceThink = 1;
    const start = entry.root.position.clone();
    for (let i = 0; i < 60; i++) {
      pool.update(1 / 60, { player: null, colliders: [], alive: [] });
    }
    return {
      distance: start.distanceTo(entry.root.position),
      legWound: entry.legWound,
    };
  };

  const baseline = travel(false);
  const wounded = travel(true);
  assert.equal(baseline.legWound, 0);
  assert.ok(wounded.legWound > 0, 'the hit did not leave a durable leg wound');
  assert.ok(wounded.distance < baseline.distance * 0.95,
    `wounded ${wounded.distance.toFixed(3)}m vs baseline ${baseline.distance.toFixed(3)}m`);
});

test('an arm wound settles aim slower and turns a matched hit into a miss', () => {
  const engage = (wounded) => {
    const { colliders, pool } = harness();
    const entry = pool.spawn({
      id: wounded ? 'arm-wounded' : 'arm-baseline',
      role: ROLES.rifle,
      staging: STAGING.front_steps,
    });
    if (wounded) pool.registerHit(entry.figure.parts.armR, 8, 0.1);
    /* Hold everything except the durable arm impairment equal. */
    entry.suppression.value = 0;
    entry.stagger = 0;
    entry.sinceMove = 0;
    entry.root.position.set(0, 1.2, 40);
    entry.floorY = 1.2;
    entry.path.length = 0;
    entry.goal.copy(entry.root.position);
    entry.root.rotation.y = 0;
    entry.awareness = 1;
    entry.sinceThink = 1;
    entry.aimPitch = 0;
    entry.lastShot = null;
    const player = makePlayer(0, 8, 44);
    let earlyAimError = Infinity;
    let frames = 0;
    for (; frames < 180 && !entry.lastShot; frames++) {
      pool.update(1 / 60, {
        player, colliders, alive: [], playerDamageScale: 0,
      });
      if (frames === 3) earlyAimError = entry.aimError;
    }
    assert.ok(entry.lastShot, `${entry.id} never completed an aimed shot`);
    return {
      armWound: entry.armWound,
      earlyAimError,
      frames,
      onTarget: entry.lastShot.onTarget,
    };
  };

  const random = Math.random;
  Math.random = () => 0.28; // Inside rifle baseline accuracy, outside wounded accuracy.
  let baseline;
  let wounded;
  try {
    baseline = engage(false);
    wounded = engage(true);
  } finally {
    Math.random = random;
  }

  assert.equal(baseline.armWound, 0);
  assert.ok(wounded.armWound > 0, 'the hit did not leave a durable arm wound');
  assert.ok(wounded.earlyAimError > baseline.earlyAimError,
    `wounded early error ${wounded.earlyAimError} vs baseline ${baseline.earlyAimError}`);
  assert.ok(wounded.frames > baseline.frames,
    `wounded fired in ${wounded.frames} frames vs baseline ${baseline.frames}`);
  assert.equal(baseline.onTarget, true, 'the controlled baseline accuracy roll missed');
  assert.equal(wounded.onTarget, false, 'the arm wound did not spoil the same accuracy roll');
});

test('armour absorbs, and the armoured man takes more killing', () => {
  const { pool } = harness();
  const orders = releaseWave(pool, 'two');
  const armoured = orders.find((order) => order.role.id === 'armored');
  const plain = orders.find((order) => order.role.id === 'rifle');
  assert.ok(armoured && plain);
  const rounds = (id) => {
    const entry = pool.entry(id);
    let n = 0;
    while (!entry.actor.incapacitated && n < 200) {
      pool.registerHit(entry.figure.parts.body, 30, 0.3);
      n++;
    }
    return n;
  };
  assert.ok(rounds(armoured.id) > rounds(plain.id) * 1.5,
    'the armoured man soaks what kills the others');
});

/* ================================================================== */
/* THE ENSEMBLE                                                         */
/* ================================================================== */

test('the two Lous are two men', () => {
  const { scene, damage, matrix } = harness();
  const ensemble = buildSiegeEnsemble({ scene, damage, matrix });
  const lou = ensemble.members.get('lou');
  const sasole = ensemble.members.get('captain_lou_sasole');
  assert.ok(lou && sasole, 'both of them are in the house tonight');
  assert.notEqual(lou.id, sasole.id);
  assert.notEqual(lou.figure.parts.profile.height, sasole.figure.parts.profile.height);
  assert.notEqual(lou.root.name, sasole.root.name);
  /* And they are never staged as the same man: Sasole is not in the fight. */
  ensemble.stage('WAVE_ONE');
  assert.equal(lou.root.visible, true);
  assert.equal(sasole.root.visible, false);
  ensemble.stage('TO_SASOLE');
  assert.equal(sasole.root.visible, true, 'he arrives for his own objective');
});

test('Big Uncle Lou keeps his same-night mansion clothes through the siege', () => {
  const { scene, colliders, damage, matrix } = harness();
  const ensemble = buildSiegeEnsemble({ scene, damage, matrix });
  const lou = ensemble.members.get('lou');

  assert.equal(lou.figure.parts.profile.height, BIG_UNCLE_LOU_MANSION.height);
  assert.equal(lou.figure.parts.profile.outfit, BIG_UNCLE_LOU_MANSION.dress);
  assert.equal(lou.figure.parts.profile.watch, BIG_UNCLE_LOU_MANSION.watch);
  assert.equal(lou.figure.parts.profile.bracelet, BIG_UNCLE_LOU_MANSION.bracelet);
  assert.equal(lou.figure.parts.profile.chainStyle, BIG_UNCLE_LOU_MANSION.chainStyle);
  assert.ok(lou.figure.parts.body.getObjectByName('camp.front.left'));
  assert.ok(lou.figure.parts.body.getObjectByName('camp.front.right'));
  assert.ok(lou.figure.parts.body.getObjectByName('camp.pattern.tile'));
  assert.equal(lou.figure.parts.body.getObjectByName('suit.jacket.chest'), undefined);

  // Wardrobe reuse must not replace any of the authored siege behavior.
  assert.deepEqual(lou.definition.routine, ['phone', 'window', 'callout']);
  assert.equal(lou.weaponId, 'pistol9');
  assert.ok(lou.gun, 'Lou lost his mission pistol');
  ensemble.stage('BRIEFING');
  ensemble.update(0.1, { player: makePlayer(), colliders, hostiles: [] });
  assert.equal(lou.businessKey, 'phone');
  assert.ok(lou.figure.parts.armR.rotation.x < -2, 'Lou lost the phone pose');
});

test('no posting blocks the staircase or the balcony bay', () => {
  const { scene, damage, matrix } = harness();
  const ensemble = buildSiegeEnsemble({ scene, damage, matrix });
  for (const post of ensemble.allPosts()) {
    for (const zone of KEEP_CLEAR) {
      const inside = post.x >= zone.x0 && post.x <= zone.x1
        && post.z >= zone.z0 && post.z <= zone.z1;
      assert.equal(inside, false,
        `${post.id} stands in ${zone.label} on ${post.beat}`);
    }
  }
});
test('the wounded guard wave pose clears the east gallery fixtures', () => {
  const scene = new THREE.Scene();
  const grounds = buildMansionGrounds(scene);
  const interior = buildMansionInterior(grounds.shell);
  scene.add(grounds.root, interior.root);
  const damage = new MansionDamageState({ colliders: [], state: 'under_attack' });
  const dressing = buildSiegeDressing({ damage, grounds, interior });
  scene.add(dressing.root);
  const ensemble = buildSiegeEnsemble({
    scene,
    damage,
    groundAt: (x, z, y) => interior.floorAt(x, z, y) ?? 0,
  });
  ensemble.stage('WAVE_ONE');
  scene.updateMatrixWorld(true);

  const plantBoxes = [];
  scene.traverse((object) => {
    if (object.name !== 'plant') return;
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    if (Math.abs(center.x - 3.4) < 0.2 && Math.abs(center.z - 52.2) < 0.2) {
      plantBoxes.push(box);
    }
  });
  const triage = scene.getObjectByName('siege.station.triage');
  assert.ok(triage, 'triage station could not be identified');
  const triageBox = new THREE.Box3().setFromObject(triage);

  assert.equal(plantBoxes.length, 1, 'east gallery planter could not be identified');

  const wounded = ensemble.members.get('guard_wounded');
  const woundedBox = new THREE.Box3().setFromObject(wounded.root);
  assert.equal(
    plantBoxes[0].intersectsBox(woundedBox),
    false,
    'the wounded guard is lying through the east gallery planter',
  );
  assert.equal(
    triageBox.intersectsBox(woundedBox),
    false,
    'the wounded guard is lying through the open triage case',
  );
});

test('the armed checkpoint tending tableau keeps every Gratin limb clear of the wounded guard', () => {
  const scene = new THREE.Scene();
  const grounds = buildMansionGrounds(scene);
  const interior = buildMansionInterior(grounds.shell);
  scene.add(grounds.root, interior.root);
  const damage = new MansionDamageState({ colliders: [], state: 'under_attack' });
  const ensemble = buildSiegeEnsemble({
    scene,
    damage,
    groundAt: (x, z, y) => interior.floorAt(x, z, y) ?? 0,
  });
  ensemble.stage('TO_OFFICE');
  scene.updateMatrixWorld(true);

  const visibleMeshes = (id) => {
    const meshes = [];
    ensemble.members.get(id).root.traverse((object) => {
      if (!object.isMesh || object.visible === false) return;
      let ancestor = object.parent;
      while (ancestor && ancestor !== scene) {
        if (ancestor.visible === false) return;
        ancestor = ancestor.parent;
      }
      meshes.push({
        name: object.name || object.type,
        box: new THREE.Box3().setFromObject(object),
      });
    });
    return meshes;
  };
  const violations = [];
  for (const left of visibleMeshes('gratin')) {
    for (const right of visibleMeshes('guard_wounded')) {
      const overlap = {
        x: Math.min(left.box.max.x, right.box.max.x) - Math.max(left.box.min.x, right.box.min.x),
        y: Math.min(left.box.max.y, right.box.max.y) - Math.max(left.box.min.y, right.box.min.y),
        z: Math.min(left.box.max.z, right.box.max.z) - Math.max(left.box.min.z, right.box.min.z),
      };
      if (Math.min(overlap.x, overlap.y, overlap.z) > 0.03) {
        violations.push({ left: left.name, right: right.name, overlap });
      }
    }
  }
  assert.deepEqual(violations, [],
    'the armed checkpoint stages Gratin inside the wounded guard instead of tending beside him');
});

test('the little-friend staging clears the triage case, planter, and neighbouring defenders', () => {
  const scene = new THREE.Scene();
  const grounds = buildMansionGrounds(scene);
  const interior = buildMansionInterior(grounds.shell);
  scene.add(grounds.root, interior.root);
  const damage = new MansionDamageState({ colliders: [], state: 'under_attack' });
  const dressing = buildSiegeDressing({ damage, grounds, interior });
  scene.add(dressing.root);
  const ensemble = buildSiegeEnsemble({
    scene,
    damage,
    groundAt: (x, z, y) => interior.floorAt(x, z, y) ?? 0,
  });
  ensemble.stage('LITTLE_FRIEND');
  scene.updateMatrixWorld(true);

  let planterBox = null;
  interior.root.traverse((object) => {
    if (object.name !== 'plant') return;
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    if (Math.abs(center.x - 3.4) < 0.2 && Math.abs(center.z - 52.2) < 0.2) planterBox = box;
  });
  const triage = scene.getObjectByName('siege.station.triage');
  const worklamp = scene.getObjectByName('siege.step.worklamp');
  assert.ok(planterBox, 'east gallery planter could not be identified');
  assert.ok(triage, 'triage station could not be identified');
  assert.ok(worklamp, 'firing-step worklamp could not be identified');

  const actorBox = (id) => new THREE.Box3().setFromObject(ensemble.members.get(id).root);
  const gratin = actorBox('gratin');
  const wounded = actorBox('guard_wounded');
  const eastGuard = actorBox('guard_1');
  const irish = actorBox('irish');
  const numbskull = actorBox('numbskull');
  assert.equal(gratin.intersectsBox(planterBox), false,
    'Gratin occupies the east gallery planter at the little-friend checkpoint');
  assert.equal(gratin.intersectsBox(wounded), false,
    'Gratin occupies the wounded guard instead of tending beside him');
  assert.equal(eastGuard.intersectsBox(new THREE.Box3().setFromObject(triage)), false,
    'the east guard stands in the open triage case');
  assert.equal(eastGuard.intersectsBox(new THREE.Box3().setFromObject(worklamp)), false,
    'the east guard stands through the firing-step worklamp');
  assert.equal(irish.intersectsBox(numbskull), false,
    'Irish and Numbskull share body volume on the west landing');
});

test('the aftermath tableau clears the east planter and separates its three bodies', () => {
  const scene = new THREE.Scene();
  const grounds = buildMansionGrounds(scene);
  const interior = buildMansionInterior(grounds.shell);
  scene.add(grounds.root, interior.root);
  const damage = new MansionDamageState({ colliders: [], state: 'damaged' });
  const ensemble = buildSiegeEnsemble({
    scene,
    damage,
    groundAt: (x, z, y) => interior.floorAt(x, z, y) ?? 0,
  });
  ensemble.stage('AFTERMATH');
  scene.updateMatrixWorld(true);

  let planterBox = null;
  interior.root.traverse((object) => {
    if (object.name !== 'plant') return;
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    if (Math.abs(center.x - 3.4) < 0.2 && Math.abs(center.z - 52.2) < 0.2) planterBox = box;
  });
  assert.ok(planterBox, 'east gallery planter could not be identified');
  const tableau = ['captain_lou_sasole', 'gratin', 'guard_wounded']
    .map((id) => ({ id, box: new THREE.Box3().setFromObject(ensemble.members.get(id).root) }));
  assert.ok(tableau.every(({ box }) => !box.intersectsBox(planterBox)),
    'the aftermath tableau still occupies the east gallery foliage');
  for (let left = 0; left < tableau.length; left += 1) {
    for (let right = left + 1; right < tableau.length; right += 1) {
      assert.equal(tableau[left].box.intersectsBox(tableau[right].box), false,
        `${tableau[left].id} intersects ${tableau[right].id} in the aftermath tableau`);
    }
  }

  const shubes = new THREE.Box3().setFromObject(ensemble.members.get('shubenator').root);
  const galleryNorth = [];
  interior.root.traverse((object) => {
    if (object.userData.geometryGate?.assemblyId?.includes(':gallery-north:')) {
      galleryNorth.push(new THREE.Box3().setFromObject(object));
    }
  });
  assert.ok(galleryNorth.length > 0, 'gallery-north partition could not be identified');
  assert.ok(galleryNorth.every((box) => !shubes.intersectsBox(box)),
    'the aftermath Shubenator post backs into the gallery-north partition');

  const booski = new THREE.Box3().setFromObject(ensemble.members.get('booski').root);
  const guard = new THREE.Box3().setFromObject(ensemble.members.get('guard_1').root);
  assert.equal(booski.intersectsBox(guard), false,
    'the east aftermath guard occupies Booski and his weapon');

  const visibleMeshBoxes = (id) => {
    const boxes = [];
    ensemble.members.get(id).root.traverse((object) => {
      if (!object.isMesh || object.visible === false) return;
      boxes.push({ name: object.name || object.type, box: new THREE.Box3().setFromObject(object) });
    });
    return boxes;
  };
  const westRailViolations = [];
  for (const left of visibleMeshBoxes('irish')) {
    for (const right of visibleMeshBoxes('numbskull')) {
      const overlap = [
        Math.min(left.box.max.x, right.box.max.x) - Math.max(left.box.min.x, right.box.min.x),
        Math.min(left.box.max.y, right.box.max.y) - Math.max(left.box.min.y, right.box.min.y),
        Math.min(left.box.max.z, right.box.max.z) - Math.max(left.box.min.z, right.box.min.z),
      ];
      if (Math.min(...overlap) > 0.03) {
        westRailViolations.push({ left: left.name, right: right.name, overlap });
      }
    }
  }
  assert.deepEqual(westRailViolations, [],
    'Irish and Numbskull clear coarse body boxes but still share posed limb volume');
});

test('the post-battle turn toward Captain Sasole clears neighbours and the gallery doorway', () => {
  const scene = new THREE.Scene();
  const grounds = buildMansionGrounds(scene);
  const interior = buildMansionInterior(grounds.shell);
  scene.add(grounds.root, interior.root);
  const damage = new MansionDamageState({ colliders: [], state: 'post_battle' });
  const ensemble = buildSiegeEnsemble({
    scene,
    damage,
    groundAt: (x, z, y) => interior.floorAt(x, z, y) ?? 0,
  });
  ensemble.stage('TO_SASOLE');
  scene.updateMatrixWorld(true);

  const visibleMeshes = (root) => {
    const meshes = [];
    root.traverse((object) => {
      if (!object.isMesh) return;
      let cursor = object;
      while (cursor) {
        if (cursor.visible === false) return;
        if (cursor === root) break;
        cursor = cursor.parent;
      }
      meshes.push({ object, name: object.name || object.type, box: new THREE.Box3().setFromObject(object) });
    });
    return meshes;
  };
  const overlapDepth = (left, right) => Math.min(
    Math.min(left.max.x, right.max.x) - Math.max(left.min.x, right.min.x),
    Math.min(left.max.y, right.max.y) - Math.max(left.min.y, right.min.y),
    Math.min(left.max.z, right.max.z) - Math.max(left.min.z, right.min.z),
  );
  const faults = [];
  for (const [leftId, rightId] of [
    ['guard_0', 'rippinflow'],
    ['irish', 'numbskull'],
  ]) {
    for (const left of visibleMeshes(ensemble.members.get(leftId).root)) {
      for (const right of visibleMeshes(ensemble.members.get(rightId).root)) {
        const depth = overlapDepth(left.box, right.box);
        if (depth > 0.03) faults.push(`${leftId}/${left.name} <> ${rightId}/${right.name}: ${depth.toFixed(3)} m`);
      }
    }
  }
  const hogMama = visibleMeshes(ensemble.members.get('hogmama').root);
  const interiorMeshes = visibleMeshes(interior.root).filter(({ object }) => (
    object.name === 'gallery-north-case'
    || object.userData.geometryGate?.assemblyId === 'mansion-room-finish:-8.85:8.85:53.15:62.85:6'
  ));
  assert.ok(interiorMeshes.length > 1, 'gallery doorway jamb/finish geometry could not be identified');
  for (const actorPart of hogMama) {
    for (const fixture of interiorMeshes) {
      const depth = overlapDepth(actorPart.box, fixture.box);
      if (depth > 0.03) faults.push(`hogmama/${actorPart.name} <> interior/${fixture.name}: ${depth.toFixed(3)} m`);
    }
  }
  assert.deepEqual(faults, [], faults.slice(0, 20).join('; '));
});

test('the armed checkpoint radio and SAW posts clear their real room fittings', () => {
  const scene = new THREE.Scene();
  const grounds = buildMansionGrounds(scene);
  const interior = buildMansionInterior(grounds.shell);
  scene.add(grounds.root, interior.root);
  const damage = new MansionDamageState({ colliders: [], state: 'under_attack' });
  const ensemble = buildSiegeEnsemble({
    scene,
    damage,
    groundAt: (x, z, y) => interior.floorAt(x, z, y) ?? 0,
  });
  ensemble.stage('TO_OFFICE');
  scene.updateMatrixWorld(true);

  const shubes = new THREE.Box3().setFromObject(ensemble.members.get('shubenator').root);
  const death = new THREE.Box3().setFromObject(ensemble.members.get('deathmegatron').root);
  const table = new THREE.Box3().setFromObject(interior.root.getObjectByName('conference-table'));
  const forbidden = [];
  interior.root.traverse((object) => {
    if (object.name === 'suite-stair-wall'
        || object.name?.startsWith('office-fireside-chair')
        || object.userData.geometryGate?.assemblyId === 'mansion-office-bookcase-run'
        || object.userData.geometryGate?.assemblyId === 'mansion-office-drinks-table'
        || object.userData.geometryGate?.assemblyId === 'mansion-suite-secret-stair') {
      forbidden.push(new THREE.Box3().setFromObject(object));
    }
  });
  assert.equal(shubes.intersectsBox(table), false, 'Shubenator stands through the conference table');
  assert.ok(forbidden.length > 0, 'suite-stair/office fittings could not be identified');
  assert.ok(forbidden.every((box) => !death.intersectsBox(box)),
    'DeathMegatron or his SAW occupies a suite-stair/office fitting');
});

test('every posting is inside the house', () => {
  const { scene, damage, matrix } = harness();
  const ensemble = buildSiegeEnsemble({ scene, damage, matrix });
  for (const post of ensemble.allPosts()) {
    assert.ok(post.x >= HOUSE_BOUNDS.x0 && post.x <= HOUSE_BOUNDS.x1,
      `${post.id}@${post.beat} x ${post.x}`);
    assert.ok(post.z >= HOUSE_BOUNDS.z0 && post.z <= HOUSE_BOUNDS.z1,
      `${post.id}@${post.beat} z ${post.z}`);
    assert.ok(post.y >= HOUSE_BOUNDS.y0 && post.y <= HOUSE_BOUNDS.y1,
      `${post.id}@${post.beat} y ${post.y}`);
  }
});

test('the ensemble is layered across the house, not stood in a semicircle', () => {
  const { scene, damage, matrix } = harness();
  const ensemble = buildSiegeEnsemble({ scene, damage, matrix });
  ensemble.stage('WAVE_ONE');
  const standing = [...ensemble.members.values()].filter((m) => m.root.visible);
  assert.ok(standing.length >= 14, 'almost everybody is in it');
  const xs = standing.map((m) => m.root.position.x);
  const zs = standing.map((m) => m.root.position.z);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 16, 'spread east to west');
  assert.ok(Math.max(...zs) - Math.min(...zs) > 12, 'and front to back');
  /* Nobody is standing on top of anybody. */
  for (let i = 0; i < standing.length; i++) {
    for (let j = i + 1; j < standing.length; j++) {
      const d = standing[i].root.position.distanceTo(standing[j].root.position);
      assert.ok(d > 0.6, `${standing[i].id} and ${standing[j].id} are ${d.toFixed(2)}m apart`);
    }
  }
});

test('they keep doing things through the conversation', () => {
  const { scene, colliders, damage, matrix } = harness();
  const ensemble = buildSiegeEnsemble({ scene, damage, matrix });
  ensemble.stage('BRIEFING');
  const busy = new Map();
  const player = makePlayer(0, 7.66, 64);
  for (let i = 0; i < 60 * 30; i++) {
    ensemble.update(1 / 60, { player, colliders, hostiles: [] });
    for (const member of ensemble.members.values()) {
      if (!member.businessKey) continue;
      if (!busy.has(member.id)) busy.set(member.id, new Set());
      busy.get(member.id).add(member.businessKey);
    }
  }
  const staged = [...ensemble.members.values()].filter((m) => m.root.visible && !m.wounded);
  assert.ok(busy.size >= staged.length - 1,
    `only ${busy.size} of ${staged.length} did anything`);
  /* And they are not all doing the same thing. */
  const everything = new Set([...busy.values()].flatMap((set) => [...set]));
  assert.ok(everything.size >= 4, `only ${everything.size} kinds of business`);
  /* The two the brief names by hand. */
  assert.ok(busy.get('lou')?.has('phone'), 'Lou works the phone');
  assert.ok(busy.get('gratin')?.has('tend'), 'Gratin works on the wounded guard');
});

test('the house being hit makes people flinch', () => {
  const { scene, damage, matrix } = harness();
  const ensemble = buildSiegeEnsemble({ scene, damage, matrix });
  ensemble.stage('WAVE_TWO');
  const at = new THREE.Vector3(0, 6, 50);
  const touched = ensemble.noteImpact(at, 8);
  assert.ok(touched >= 4, `only ${touched} people reacted`);
  const flinching = [...ensemble.members.values()]
    .filter((member) => member.businessKey === 'flinch');
  assert.ok(flinching.length > 0);
  /* Everybody inside the radius ducks; only the ones the shared suppression
   * model considers a near miss -- its own four-metre band -- are pinned by
   * it. Two different radii, and the second is the core's decision. */
  const near = flinching.filter((member) => member.root.position.distanceTo(at) < 3.5);
  assert.ok(near.length > 0, 'somebody was actually close to it');
  assert.ok(near.every((member) => member.suppression.value > 0),
    'and everybody that close is pinned');
});

test('friendlies acquire through shared LOS and fire only from their rendered bore', () => {
  const { scene, damage, matrix } = harness();
  const ensemble = buildSiegeEnsemble({ scene, damage, matrix });
  ensemble.stage('WAVE_ONE');
  const shooter = [...ensemble.members.values()]
    .find((member) => member.staged && member.weapon && !member.wounded);
  assert.ok(shooter, 'the staged ensemble has no armed shooter');
  for (const member of ensemble.members.values()) {
    if (member !== shooter) member.wounded = true;
  }
  shooter.root.position.set(0, 1.2, 40);
  shooter.goal.copy(shooter.root.position);
  shooter.root.rotation.y = 0;
  shooter.businessClock = 999;
  shooter.businessKey = null;
  shooter.sinceThink = 1;
  shooter.perception.restore({ awareness: 1, memory: 0, lastSeen: null });

  const hostileRoot = new THREE.Group();
  hostileRoot.position.set(0, 1.2, 48);
  const hostileActor = new CombatActor({
    id: 'ensemble-los-target', faction: FACTIONS.CARTEL, maxHealth: 1000,
  });
  hostileRoot.userData.combatActor = hostileActor;
  scene.add(hostileRoot);
  const hostile = { root: hostileRoot, actor: hostileActor };
  const wall = new THREE.Box3(
    new THREE.Vector3(-2, 1.1, 44), new THREE.Vector3(2, 4, 44.5),
  );
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    for (let frame = 0; frame < 90; frame++) {
      ensemble.update(1 / 60, { player: null, hostiles: [hostile], colliders: [wall] });
    }
    assert.equal(shooter.targetVisible, false, 'a friendly acquired through the wall');
    assert.equal(shooter.shotsFired, 0, 'a friendly fired through unseen cover');

    shooter.sinceThink = 1;
    for (let frame = 0; frame < 240; frame++) {
      ensemble.update(1 / 60, {
        player: null, hostiles: [hostile], colliders: [], holdFire: true,
      });
    }
    assert.equal(shooter.targetVisible, true, 'the protected line froze friendly perception');
    assert.equal(shooter.shotsFired, 0, 'a friendly gun talked over the protected line');
    for (let frame = 0; frame < 360 && !shooter.lastShot; frame++) {
      ensemble.update(1 / 60, { player: null, hostiles: [hostile], colliders: [] });
    }
  } finally {
    Math.random = originalRandom;
  }

  assert.equal(shooter.targetVisible, true);
  assert.ok(shooter.lastShot, 'the exposed target never produced an aligned shot');
  assert.ok(shooter.lastShot.aimError <= 0.14);
  assert.ok(shooter.lastShot.boreError <= 0.14);
  scene.updateMatrixWorld(true);
  const muzzle = shooter.gun.localToWorld(shooter.gun.userData.muzzle.clone());
  assert.ok(shooter.lastShot.origin.distanceTo(muzzle) <= 1e-3,
    'friendly fire did not originate at the rendered catalog muzzle');
  const checkpoint = JSON.parse(JSON.stringify(ensemble.snapshot()));
  const saved = checkpoint.members.find((record) => record.id === shooter.id);
  shooter.weapon.rounds = 0;
  shooter.weapon.setTrigger(true);
  shooter.perception.target = hostile;
  shooter.perception.targetVisible = true;
  shooter.target = hostile;
  shooter.targetVisible = true;
  shooter.weaponAim.aligned = true;
  shooter.aimAligned = true;
  assert.equal(ensemble.restore(checkpoint), true);
  assert.equal(shooter.weapon.rounds, saved.weapon.rounds);
  assert.equal(shooter.weapon.triggerHeld, false);
  assert.equal(shooter.perception.target, null);
  assert.equal(shooter.target, null);
  assert.equal(shooter.targetVisible, false);
  assert.equal(shooter.aimAligned, false);
  ensemble.dispose();
});

test('a live defender flinches with his gun, never as the hands-up owner of another ally\'s revive prompt', () => {
  const { scene, damage, matrix } = harness();
  const ensemble = buildSiegeEnsemble({ scene, damage, matrix });
  ensemble.stage('LITTLE_FRIEND');

  /* Reproduce the exact stair composition: Eric is the protected man on the
   * floor while the nearer east-side guard reacts to a hit on the house. */
  const eric = ensemble.members.get('eric');
  eric.actor.applyHit({ amount: 9999, attacker: { faction: FACTIONS.CARTEL }, matrix });
  ensemble.update(0.1, {});
  const guard = ensemble.members.get('guard_1');
  const prompt = ensemble.nearestDowned(new THREE.Vector3(6.8, 7.02, 51.3), 2.4);
  assert.equal(prompt?.id, 'eric', 'the revive prompt no longer belongs to the fallen man');
  ensemble.noteImpact(guard.root.position.clone(), 0.1);

  /* Injury readability remains unchanged: Eric is alive but visibly fallen,
   * bleeding and disarmed. The live guard is a separate readable armed state. */
  assert.equal(eric.downed, true);
  assert.equal(eric.actor.incapacitated, false);
  assert.equal(eric.figure.pose, 'fallen');
  assert.equal(eric.gun.visible, false);
  assert.equal(eric.bloodPool?.visible, true);
  assert.equal(guard.downed, false);
  assert.equal(guard.actor.incapacitated, false);
  assert.equal(guard.businessKey, 'flinch');
  assert.equal(guard.figure.pose, 'flinch');
  assert.equal(guard.gun.visible, true,
    'the live guard drops his carbine and reads as a hands-up surrender beside Eric\'s revive prompt');

  const handMesh = (forearm) => {
    let hand = null;
    forearm.traverse((object) => {
      if (!hand && object.isMesh && /(^|\.)hand$/.test(object.name ?? '')) hand = object;
    });
    return hand;
  };
  scene.updateMatrixWorld(true);
  const leftHand = handMesh(guard.figure.parts.foreL);
  const rightHand = handMesh(guard.figure.parts.foreR);
  let primaryGrip = null;
  guard.gun.traverse((object) => {
    if (!primaryGrip && object.name?.includes('grip') && !object.name.includes('foregrip')) {
      primaryGrip = object;
    }
  });
  assert.ok(leftHand && rightHand && primaryGrip, 'the flinching guard lost measurable hand/grip geometry');
  const rightBox = new THREE.Box3().setFromObject(rightHand);
  const gripBox = new THREE.Box3().setFromObject(primaryGrip);
  assert.equal(rightBox.intersectsBox(gripBox), true,
    'the flinching guard keeps a visible carbine but loses its firing grip');
  const gunBox = new THREE.Box3().setFromObject(guard.gun);
  const leftCentre = new THREE.Box3().setFromObject(leftHand).getCenter(new THREE.Vector3());
  assert.ok(gunBox.distanceToPoint(leftCentre) <= 0.04,
    `the flinching guard's support hand is ${gunBox.distanceToPoint(leftCentre).toFixed(3)} m off the carbine`);
  const headY = new THREE.Box3().setFromObject(guard.figure.parts.head)
    .getCenter(new THREE.Vector3()).y;
  const rightY = rightBox.getCenter(new THREE.Vector3()).y;
  assert.equal(leftCentre.y > headY && rightY > headY, false,
    'both live hands are still raised above his head like a surrender pose');
});

test('friendlies fire, wound and suppress -- and do not outkill the player', () => {
  const { scene, colliders, damage, matrix, pool, downs } = harness();
  const ensemble = buildSiegeEnsemble({ scene, damage, matrix });
  ensemble.stage('WAVE_ONE');
  releaseWave(pool, 'one');
  const player = makePlayer();
  run(pool, ensemble, 90, {
    attackerCtx: () => ({ player, colliders, alive: ensemble.targets() }),
    ensembleCtx: () => ({ player, colliders, hostiles: pool.living() }),
    after: () => {
      if (player.actor.health <= 10) {
        player.actor.health = 100;
        player.actor.incapacitated = false;
      }
    },
  });
  const shots = [...ensemble.members.values()].reduce((n, m) => n + m.shotsFired, 0);
  assert.ok(shots > 200, `the family fired ${shots} rounds`);
  assert.ok(ensemble.friendlyKills <= KILL_BUDGET.WAVE_ONE,
    `they killed ${ensemble.friendlyKills}, budget was ${KILL_BUDGET.WAVE_ONE}`);
  assert.equal(ensemble.killBudget, 0, 'and they spent every round of it');
  /* Every kill they took still went through the pool's own reporting. */
  assert.equal(downs.length, ensemble.friendlyKills);
  assert.equal(new Set(downs).size, downs.length);
  /* They also took damage. Nobody in this fight is a statue. */
  const hurt = [...ensemble.members.values()]
    .filter((m) => m.actor.health < m.actor.maxHealth);
  assert.ok(hurt.length > 2, `only ${hurt.length} of them were touched`);
});

test('friendlies reload rather than firing for ever', () => {
  const { scene, colliders, damage, matrix, pool } = harness();
  const ensemble = buildSiegeEnsemble({ scene, damage, matrix });
  ensemble.stage('WAVE_TWO');
  releaseWave(pool, 'two');
  const player = makePlayer();
  let sawAReload = false;
  run(pool, ensemble, 60, {
    attackerCtx: () => ({ player, colliders, alive: ensemble.targets() }),
    ensembleCtx: () => ({ player, colliders, hostiles: pool.living() }),
    after: () => {
      for (const member of ensemble.members.values()) {
        if (member.weapon?.reloading > 0) sawAReload = true;
      }
      if (player.actor.health <= 10) {
        player.actor.health = 100;
        player.actor.incapacitated = false;
      }
    },
  });
  assert.ok(sawAReload, 'somebody had to change a magazine');
  for (const member of ensemble.members.values()) {
    if (!member.weapon) continue;
    assert.ok(member.weapon.magazine <= member.weapon.definition.magazineSize);
    assert.ok(member.weapon.magazine >= 0);
  }
});

test('friendlies do not stand in the player\'s line', () => {
  const { scene, colliders, damage, matrix } = harness();
  const ensemble = buildSiegeEnsemble({ scene, damage, matrix });
  ensemble.stage('WAVE_ONE');
  /* Put the player exactly where the brief puts him and walk him along the
   * rail. Nobody may end up inside him. */
  const player = makePlayer(0, 7.66, 46.6);
  for (let i = 0; i < 60 * 20; i++) {
    player.position.x = Math.sin(i / 90) * 3;
    ensemble.update(1 / 60, { player, colliders, hostiles: [] });
    for (const member of ensemble.members.values()) {
      if (!member.root.visible) continue;
      const flat = Math.hypot(
        member.root.position.x - player.position.x,
        member.root.position.z - player.position.z,
      );
      assert.ok(flat > 1.2,
        `${member.id} is ${flat.toFixed(2)}m from the player`);
    }
  }
});

test('the named cast survives and the guards do not have to', () => {
  const { scene, damage, matrix } = harness();
  const ensemble = buildSiegeEnsemble({ scene, damage, matrix });
  ensemble.stage('WAVE_TWO');
  for (const member of ensemble.members.values()) {
    const survives = SURVIVES_THE_SIEGE.includes(member.id);
    assert.equal(member.actor.core, survives,
      `${member.id}: survival flag and core protection disagree`);
    member.actor.applyHit({ amount: 9999, attacker: { faction: FACTIONS.CARTEL }, matrix });
    assert.equal(member.actor.incapacitated, !survives,
      `${member.id} ${survives ? 'died' : 'refused to die'}`);
  }
  /* The mission's flag, not a rule inside the core. Snow, Lou and Booski are
   * on it; the security are not, which is what gives the night a cost. */
  assert.ok(ensemble.survives('lou'));
  assert.ok(ensemble.survives('snow'));
  assert.equal(ensemble.survives('guard_0'), false);
  assert.equal(ensemble.survives('guard_wounded'), false);
});

test('the foyer fight on the way up stays the player\'s', () => {
  /* The family is already on the landing when the player crosses the foyer,
   * which is what "the house is fighting on the way past" means. They must
   * not clear his encounter for him from six metres above it: outside the
   * two wave beats the kill budget is zero, so their fire wounds and
   * suppresses and never finishes anybody. */
  const { scene, damage, matrix } = harness();
  const ensemble = buildSiegeEnsemble({ scene, damage, matrix });
  for (const beat of ['TO_OFFICE', 'BRIEFING', 'LULL', 'AFTERMATH', 'TO_SASOLE']) {
    ensemble.stage(beat);
    assert.equal(ensemble.killBudget, 0, `${beat} handed out kills`);
  }
  ensemble.stage('WAVE_ONE');
  assert.equal(ensemble.killBudget, KILL_BUDGET.WAVE_ONE);
  ensemble.stage('WAVE_TWO');
  assert.equal(ensemble.killBudget, KILL_BUDGET.WAVE_TWO);
});

test('every beat from the mission model stages somebody', () => {
  const { scene, damage, matrix } = harness();
  const ensemble = buildSiegeEnsemble({ scene, damage, matrix });
  for (const beat of [
    'ARM', 'TO_OFFICE', 'BRIEFING', 'LITTLE_FRIEND', 'WAVE_ONE', 'LULL', 'WAVE_TWO',
    'AFTERMATH', 'TO_SASOLE',
  ]) {
    ensemble.stage(beat);
    const standing = [...ensemble.members.values()].filter((m) => m.root.visible);
    assert.ok(standing.length >= 14, `${beat} staged only ${standing.length} people`);
  }
});

test('the armory checkpoint pre-stages the same hidden defence used after the first pickup', () => {
  const { scene, damage, matrix } = harness();
  const ensemble = buildSiegeEnsemble({ scene, damage, matrix });
  ensemble.stage('ARM');
  const armory = [...ensemble.members.values()]
    .filter((member) => member.staged)
    .map((member) => ({
      id: member.id,
      position: member.root.position.toArray(),
      facing: member.root.rotation.y,
    }));
  ensemble.stage('TO_OFFICE');
  const upstairs = [...ensemble.members.values()]
    .filter((member) => member.staged)
    .map((member) => ({
      id: member.id,
      position: member.root.position.toArray(),
      facing: member.root.rotation.y,
    }));
  assert.ok(armory.length >= 14, `only ${armory.length} defenders were ready above the armory`);
  assert.deepEqual(upstairs, armory,
    'taking the first gun visibly restaged or refaced the already-hidden defence');
});

test('the aftermath is people working, not people at attention', () => {
  const { scene, colliders, damage, matrix } = harness();
  const ensemble = buildSiegeEnsemble({ scene, damage, matrix });
  ensemble.stage('AFTERMATH');
  /* Lou has come to the landing, which is the beat the brief writes. */
  const lou = ensemble.members.get('lou');
  assert.ok(lou.root.position.z < 55, `Lou is still at z ${lou.root.position.z}`);
  const busy = new Set();
  const player = makePlayer(0, 7.66, 48.5);
  for (let i = 0; i < 60 * 30; i++) {
    ensemble.update(1 / 60, { player, colliders, hostiles: [] });
    for (const member of ensemble.members.values()) {
      if (member.businessKey) busy.add(member.businessKey);
    }
  }
  assert.ok(busy.size >= 3, `the aftermath had ${busy.size} kinds of business in it`);
  assert.ok(busy.has('tend') || busy.has('reload'),
    'somebody is reloading or working on the wounded man');
});

/* ================================================================== */
/* THE SHARED FRAMEWORK, AND NOTHING BESIDE IT                          */
/* ================================================================== */

test('attackers are CARTEL and friendlies are CREW, declared not compared', () => {
  const { scene, damage, matrix, pool } = harness();
  const ensemble = buildSiegeEnsemble({ scene, damage, matrix });
  releaseWave(pool, 'one');
  for (const entry of pool.all()) {
    assert.equal(entry.actor.faction, FACTIONS.CARTEL);
  }
  for (const member of ensemble.members.values()) {
    assert.equal(member.actor.faction, FACTIONS.CREW);
  }
  /* And a cartel actor cannot be talked into shooting another cartel actor
   * by anything in these two modules. */
  const [a, b] = pool.all();
  assert.equal(matrix.canTarget(a.actor, b.actor), false);
});

test('everybody in the siege is a real CombatActor on the shared core', () => {
  const { scene, damage, matrix, pool } = harness();
  const ensemble = buildSiegeEnsemble({ scene, damage, matrix });
  releaseWave(pool, 'one');
  const everyone = [
    ...pool.all().map((entry) => entry.actor),
    ...[...ensemble.members.values()].map((member) => member.actor),
  ];
  assert.ok(everyone.length >= 24);
  for (const actor of everyone) {
    assert.ok(actor instanceof CombatActor, `${actor.id} is not a CombatActor`);
    assert.ok(actor.maxHealth > 0);
    assert.equal(typeof actor.applyHit, 'function');
    assert.equal(typeof actor.snapshot, 'function');
  }
});

test('an attacker\'s health and armour come from the role table, unedited', () => {
  const { pool } = harness();
  const orders = releaseWave(pool, 'two');
  for (const order of orders) {
    const entry = pool.entry(order.id);
    assert.equal(entry.actor.maxHealth, ROLES[order.role.id].health);
    assert.equal(entry.actor.armor, ROLES[order.role.id].armor);
  }
});

test('every attacker carries a gun off the shared catalog', () => {
  const { pool } = harness();
  const orders = releaseWave(pool, 'two');
  const catalog = new Set(Object.keys(WEAPON_CATALOG));
  for (const order of orders) {
    const entry = pool.entry(order.id);
    assert.ok(catalog.has(entry.plan.weapon), `${entry.plan.weapon} is not in the catalog`);
    assert.ok(entry.weapon.definition.magazineSize > 0);
  }
});

test('all eight cartel roles wear readable silhouettes and keep the red headband', () => {
  const { scene, pool } = harness();
  for (const role of Object.keys(ROLES)) {
    pool.spawn({ id: `wardrobe_${role}`, role, staging: 'front_steps' });
  }

  const silhouettes = new Set();
  for (const entry of pool.all()) {
    scene.updateMatrixWorld(true);
    const bandana = [];
    const outfit = [];
    entry.root.traverse((object) => {
      if (object.isMesh && object.name?.startsWith('person.bandana.')) bandana.push(object);
      if (object.isMesh && object.userData.cartelOutfitPiece) outfit.push(object);
    });

    assert.ok(bandana.length >= 2, `${entry.role.id} lost the wrap or tail of his headband`);
    const bandanaBox = new THREE.Box3();
    for (const mesh of bandana) {
      bandanaBox.expandByObject(mesh);
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      assert.ok(materials.some((material) => {
        const colour = material?.color;
        return colour && colour.r > 0.55 && colour.r > colour.g * 1.55
          && colour.r > colour.b * 1.35;
      }), `${entry.role.id}'s headband is not visibly red`);
    }
    const bandanaSize = bandanaBox.getSize(new THREE.Vector3());
    assert.ok(bandanaSize.x >= 0.14 && bandanaSize.y >= 0.04,
      `${entry.role.id}'s red headband is too small to read`);

    assert.ok(outfit.length > 0, `${entry.role.id} has no role-readable outfit geometry`);
    const outfitBox = new THREE.Box3();
    for (const mesh of outfit) outfitBox.expandByObject(mesh);
    const size = outfitBox.getSize(new THREE.Vector3());
    assert.ok(size.x >= 0.1 && size.y >= 0.08 && size.z >= 0.02,
      `${entry.role.id}'s role kit is buried in the body`);
    silhouettes.add([
      outfit.length,
      Math.round(size.x / 0.03),
      Math.round(size.y / 0.03),
      Math.round(size.z / 0.03),
    ].join(':'));
  }
  assert.equal(silhouettes.size, Object.keys(ROLES).length,
    `only ${silhouettes.size} built cartel outfit silhouettes for eight roles`);
});

test('every attacker wears the A-Team\'s colours, and the letter is an A', () => {
  /* Owner, 2026-08-24: *"I also want to give them more identifiable A team
   * outfits."* The role kits above answer what each man DOES. Nothing said
   * whose he was, which is a problem for a crew whose whole bark pool is them
   * naming themselves. They wear a pinnie now -- a scrimmage vest in the same
   * red as the headband, letter front and back, over whatever the role gave
   * him.
   *
   * The letter is three boxes, and the first pass of it rendered as an H:
   * the legs were leaning OUT, so the crossbar closed a rectangle instead of
   * a triangle. That is the assertion below with teeth in it -- the two legs
   * have to be closer together at the top than at the bottom. */
  const { scene, pool } = harness();
  for (const role of Object.keys(ROLES)) {
    pool.spawn({ id: `colours_${role}`, role, staging: 'front_steps' });
  }
  scene.updateMatrixWorld(true);

  const counts = new Set();
  for (const entry of pool.all()) {
    const team = [];
    let body = null;
    entry.root.traverse((object) => {
      if (!body && object.userData?.hitPart === 'chest') body = object;
      if (object.isMesh && object.userData.ateamTeamPiece) team.push(object);
    });
    assert.ok(body, `${entry.role.id} has no torso to hang colours on`);
    counts.add(team.length);
    assert.ok(team.length >= 7, `${entry.role.id} is out of uniform`);

    /* A team kit is not a role kit, and the silhouette test above measures
     * role kits. Tagging the pinnie into that set would collapse eight
     * distinct outfits into one. */
    for (const mesh of team) {
      assert.notEqual(mesh.userData.cartelOutfitPiece, true,
        `${entry.role.id}'s colours are being counted as his role kit`);
      assert.match(mesh.name, /^ateam\.colours\./);
    }

    const local = new THREE.Matrix4().copy(body.matrixWorld).invert();
    const boxOf = (mesh) => {
      mesh.geometry.computeBoundingBox();
      return new THREE.Box3().copy(mesh.geometry.boundingBox)
        .applyMatrix4(new THREE.Matrix4().multiplyMatrices(local, mesh.matrixWorld));
    };
    const panels = team.filter((mesh) => {
      const size = boxOf(mesh).getSize(new THREE.Vector3());
      return size.x > 0.2 && size.y > 0.3;
    });
    assert.equal(panels.length, 2,
      `${entry.role.id} has ${panels.length} readable panel(s); a pinnie is front and back`);
    const zs = panels.map((mesh) => boxOf(mesh).getCenter(new THREE.Vector3()).z);
    assert.ok(Math.min(...zs) < -0.2 && Math.max(...zs) > 0.2,
      `${entry.role.id}'s panels are on the same side of him`);

    /* The letter. Two leaning bars per face; take the front pair. */
    const bars = team
      .filter((mesh) => !panels.includes(mesh))
      .map((mesh) => ({ mesh, box: boxOf(mesh) }))
      .filter(({ box }) => box.getCenter(new THREE.Vector3()).z > 0.2)
      .filter(({ box }) => box.getSize(new THREE.Vector3()).y > 0.1);
    assert.equal(bars.length, 2, `${entry.role.id}'s chest letter is not two legs`);
    const [left, right] = bars.sort(
      (a, b) => a.box.getCenter(new THREE.Vector3()).x - b.box.getCenter(new THREE.Vector3()).x,
    );
    const apexGap = right.box.min.x - left.box.max.x;
    const footGap = (right.box.min.x + right.box.max.x) / 2
      - (left.box.min.x + left.box.max.x) / 2;
    assert.ok(apexGap < footGap,
      `${entry.role.id} is wearing an H: the legs of the letter lean apart `
      + `(${apexGap.toFixed(3)} m at the top, ${footGap.toFixed(3)} m between centres)`);
  }
  assert.equal(counts.size, 1, 'the crew are not all in the same kit');
});

test('every visible siege gun is held at its grip and long guns are supported', () => {
  const { scene, damage, matrix, pool } = harness();
  const ensemble = buildSiegeEnsemble({ scene, damage, matrix });
  ensemble.stage('WAVE_ONE');
  releaseWave(pool, 'one');
  releaseWave(pool, 'two');
  const longGuns = new Set(['shotgun', 'carbine', 'ak47', 'saw', 'barrett']);
  const holders = [
    ...pool.all().map((entry) => ({ label: entry.id, ...entry })),
    ...[...ensemble.members.values()].map((entry) => ({ label: entry.id, ...entry })),
  ].filter((entry) => entry.gun?.visible);
  assert.ok(holders.length >= 10, `only ${holders.length} armed holders were built`);
  assert.deepEqual(new Set(holders.map((holder) => holder.weaponId ?? holder.plan.weapon)),
    new Set(['revolver', 'shotgun', 'pistol9', 'carbine', 'ak47', 'saw']));

  for (const holder of holders) {
    scene.updateMatrixWorld(true);
    const findHand = (forearm) => {
      let hand = null;
      forearm.traverse((object) => {
        if (!hand && object.isMesh && /(^|\.)hand$/.test(object.name ?? '')) hand = object;
      });
      return hand;
    };
    const rightHand = findHand(holder.figure.parts.foreR);
    const leftHand = findHand(holder.figure.parts.foreL);
    let primaryGrip = null;
    holder.gun.traverse((object) => {
      if (!primaryGrip && object.name?.includes('grip') && !object.name.includes('foregrip')) {
        primaryGrip = object;
      }
    });
    assert.ok(rightHand && leftHand && primaryGrip, `${holder.label} has no measurable hand/grip geometry`);
    const rightBox = new THREE.Box3().setFromObject(rightHand);
    const gripBox = new THREE.Box3().setFromObject(primaryGrip);
    assert.equal(rightBox.intersectsBox(gripBox), true,
      `${holder.label}'s firing hand misses the ${holder.weaponId ?? holder.plan.weapon} grip`);

    if (longGuns.has(holder.weaponId ?? holder.plan.weapon)) {
      const gunBox = new THREE.Box3().setFromObject(holder.gun);
      const leftCentre = new THREE.Box3().setFromObject(leftHand).getCenter(new THREE.Vector3());
      assert.ok(gunBox.distanceToPoint(leftCentre) <= 0.04,
        `${holder.label}'s support hand is ${gunBox.distanceToPoint(leftCentre).toFixed(3)} m off the gun`);
    }

    const muzzle = holder.gun.localToWorld(holder.gun.userData.muzzle.clone());
    const origin = holder.gun.getWorldPosition(new THREE.Vector3());
    const direction = muzzle.sub(origin).normalize();
    const forward = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(holder.root.getWorldQuaternion(new THREE.Quaternion()));
    assert.ok(direction.dot(forward) >= 0.9,
      `${holder.label}'s muzzle points away from his fighting stance`);
  }
});

test('live aim keeps every active long-gun support hand on the weapon', () => {
  const { scene, colliders, damage, matrix, pool } = harness();
  const ensemble = buildSiegeEnsemble({ scene, damage, matrix });
  ensemble.stage('WAVE_ONE');
  releaseWave(pool, 'one');
  const player = makePlayer();
  const originalRandom = Math.random;
  Math.random = () => 0.999;
  try {
    /* This is deliberately not another spawn-pose check. Both factions run
     * their real frame loops, including CombatWeaponAim pose adaptation and
     * rendered-bore steering, before any hand geometry is measured. */
    for (let frame = 0; frame < 30; frame++) {
      pool.update(1 / 60, {
        player, colliders, alive: ensemble.targets(), playerDamageScale: 0,
      });
      ensemble.update(1 / 60, {
        player, colliders, hostiles: pool.living(),
      });
    }
  } finally {
    Math.random = originalRandom;
  }

  const longGuns = new Set(['shotgun', 'carbine', 'ak47', 'saw', 'barrett']);
  const holders = [
    ...pool.living(),
    ...[...ensemble.members.values()].filter((member) => member.staged),
  ].filter((holder) => longGuns.has(holder.weaponId ?? holder.plan?.weapon)
      && holder.gun?.visible);
  assert.ok(holders.length >= 8, `only ${holders.length} live long-gun actors were exercised`);
  scene.updateMatrixWorld(true);
  for (const holder of holders) {
    assert.ok(holder.aimFrame, `${holder.id} never ran CombatWeaponAim`);
    let hand = null;
    holder.figure.parts.foreL.traverse((object) => {
      if (!hand && object.isMesh && /(^|\.)hand$/.test(object.name ?? '')) hand = object;
    });
    assert.ok(hand, `${holder.id} has no support-hand geometry`);
    const handCentre = new THREE.Box3().setFromObject(hand).getCenter(new THREE.Vector3());
    const gap = new THREE.Box3().setFromObject(holder.gun).distanceToPoint(handCentre);
    const supportPoint = holder.gun.localToWorld(
      new THREE.Vector3().fromArray(holder.gun.userData.siegeMount.support),
    );
    const targetGap = handCentre.distanceTo(supportPoint);
    assert.ok(gap <= 0.04,
      `${holder.id}'s live support hand is ${gap.toFixed(4)}m off the weapon `
      + `(${targetGap.toFixed(4)}m from support, tracked `
      + `${holder.gun.userData.siegeSupportTrack?.supported})`);
  }
});

test('live steep aim keeps the cellar attackers firing hands on their grips', () => {
  const { scene, colliders, pool } = harness();
  const entries = ENCOUNTERS.corridor.members.map((order) => pool.spawn(order));
  const player = makePlayer(0, 7.66, 46.5);
  const originalRandom = Math.random;
  Math.random = () => 0.999;
  try {
    /* These are the production actors and the production height difference
     * that exposed the receiver-origin pivot: both guns aim from the cellar
     * at an upper-floor target before their rendered grip contact is read. */
    for (let frame = 0; frame < 18; frame++) {
      pool.update(1 / 60, { player, colliders, alive: [], playerDamageScale: 0 });
    }
  } finally {
    Math.random = originalRandom;
  }

  scene.updateMatrixWorld(true);
  for (const entry of entries) {
    assert.ok(entry.aimFrame?.origin, `${entry.id} never ran live bore aim`);
    let hand = null;
    let grip = null;
    entry.figure.parts.foreR.traverse((object) => {
      if (!hand && object.isMesh && /(^|\.)hand$/.test(object.name ?? '')) hand = object;
    });
    entry.gun.traverse((object) => {
      if (!grip && object.name?.includes('grip') && !object.name.includes('foregrip')) {
        grip = object;
      }
    });
    assert.ok(hand && grip, `${entry.id} has no measurable firing hand/grip`);
    const handBox = new THREE.Box3().setFromObject(hand);
    const gripBox = new THREE.Box3().setFromObject(grip);
    assert.equal(handBox.intersectsBox(gripBox), true,
      `${entry.id}'s live firing hand misses the ${entry.plan.weapon} grip`);
    const renderedMuzzle = entry.gun.localToWorld(entry.gun.userData.muzzle.clone());
    const originGap = renderedMuzzle.distanceTo(entry.aimFrame.origin);
    assert.ok(originGap < 0.001,
      `${entry.id}'s shot origin is ${originGap.toFixed(6)}m off its rendered muzzle`);
  }
});

test('despawnAll puts the whole pool away without losing anybody', () => {
  const { pool, downs } = harness();
  const orders = releaseWave(pool, 'one');
  pool.registerHit(pool.entry(orders[0].id).figure.parts.head, 9999);
  const n = pool.despawnAll();
  assert.equal(n, orders.length);
  assert.deepEqual(pool.living(), []);
  assert.equal(downs.length, 1, 'putting them away is not killing them');
  for (const order of orders) assert.equal(pool.entry(order.id).root.visible, false);
});

test('the pool and the ensemble are damage-state layers, not a mission chore', () => {
  const { scene, colliders, damage, matrix, pool } = harness({ state: 'clean' });
  const ensemble = buildSiegeEnsemble({ scene, damage, matrix });
  assert.equal(pool.root.visible, false, 'no cartel on the walking tour');
  assert.equal(ensemble.root.visible, false);
  damage.apply('under_attack');
  assert.equal(pool.root.visible, true);
  assert.equal(ensemble.root.visible, true);
  damage.apply('damaged');
  assert.equal(pool.root.visible, true, 'the aftermath lost all of its fallen bodies');
  assert.equal(ensemble.root.visible, true, 'the family is still standing in it');
  damage.apply('post_battle');
  assert.equal(pool.root.visible, true, 'the bodies vanished while the blood pools remained');
  assert.equal(ensemble.root.visible, true);
  damage.apply('repaired');
  assert.equal(pool.root.visible, false);
  assert.equal(ensemble.root.visible, false);
  assert.equal(colliders.length, 0, 'and neither of them ever added a collider');
});

test('the guns are audible and the rounds leave marks -- through the scene', () => {
  /* Neither pool owns a decal or an AudioEngine: `world/bullets.js` wants a
   * canvas and an AudioEngine wants a browser, and a module that only owns
   * where people stand must still run headless. So both are reported, and
   * the scene may wire them at construction OR per frame. */
  const scene = new THREE.Scene();
  const colliders = [new THREE.Box3(
    new THREE.Vector3(-9, 0, 43.8), new THREE.Vector3(9, 4, 44.2),
  )];
  const damage = new MansionDamageState({ colliders, state: 'under_attack' });
  const played = [];
  const impacts = [];
  const audio = {
    hasSample: () => true,
    play: (cue) => played.push(cue),
  };
  const pool = createAttackerPool({
    scene, damage, matrix: new FactionMatrix(), onDown: () => {},
    audio, onImpact: (hit) => impacts.push(hit),
  });
  releaseWave(pool, 'one');
  const player = makePlayer(0, 7.66, 46.5);
  for (let i = 0; i < 60 * 20; i++) {
    pool.update(1 / 60, { player, colliders, alive: [] });
    if (player.actor.health <= 10) {
      player.actor.health = 100;
      player.actor.incapacitated = false;
    }
  }
  assert.ok(played.length > 20, `only ${played.length} cues`);
  /* Real catalog cue names, not invented ones. */
  assert.ok(played.every((cue) => /^weapon\.(revolver|pistol9|carbine|ak47|saw|barrett)\./.test(cue)),
    `a cue outside the catalog: ${played.find((c) => !c.startsWith('weapon.'))}`);
  assert.ok(played.some((cue) => cue.endsWith('.fire')));
  assert.ok(impacts.length > 20, `only ${impacts.length} impacts`);
  for (const hit of impacts) {
    assert.ok(Number.isFinite(hit.point.x) && Number.isFinite(hit.point.y));
    assert.ok(Math.abs(hit.normal.length() - 1) < 1e-6, 'the normal is a normal');
    assert.equal(typeof hit.material, 'string');
  }
});

test('the staging zones every wave names really exist', () => {
  for (const [id, zone] of Object.entries(STAGING)) {
    assert.equal(zone.id, id);
    assert.ok(Number.isFinite(zone.x) && Number.isFinite(zone.z));
    assert.ok(anchorById(zone.entry),
      `${id} names nav anchor "${zone.entry}", which does not exist`);
    /* And he is standing somewhere, not in the void between two rooms. */
    const room = roomAt({ x: zone.x, z: zone.z, y: zone.indoor ? undefined : null });
    assert.ok(room, `${id} at (${zone.x}, ${zone.z}) is in no room at all`);
  }
});

/* ================================================================== */
/* THE NAV GRAPH ITSELF                                                 */
/* ================================================================== */

test('every anchor is in the room it claims, and every edge is two-way', () => {
  for (const anchor of ANCHORS) {
    assert.ok(ROOMS[anchor.room], `${anchor.id} claims room "${anchor.room}"`);
    assert.equal(roomAt({ x: anchor.x, z: anchor.z, y: anchor.y }), anchor.room,
      `${anchor.id} says ${anchor.room} and stands in something else`);
    for (const neighbour of anchor.neighbors) {
      const other = anchorById(neighbour);
      assert.ok(other, `${anchor.id} names missing neighbour ${neighbour}`);
      assert.ok(other.neighbors.includes(anchor.id),
        `${anchor.id} -> ${neighbour} is one-way, so a BFS can walk into a dead end`);
    }
  }
});

test('every edge of the graph is a leg somebody could actually walk', () => {
  /* The same rule the routes are held to, applied to the graph rather than
   * to one wave's worth of paths -- so an edge that nobody happens to use
   * this week cannot be quietly wrong until somebody re-stages a group. */
  for (const anchor of ANCHORS) {
    for (const neighbour of anchor.neighbors) {
      const other = anchorById(neighbour);
      const a = { x: anchor.x, z: anchor.z, y: anchor.y };
      const b = { x: other.x, z: other.z, y: other.y };
      const crossing = crossingFor(a, b);
      if (anchor.room === other.room) {
        assert.equal(crossing, null,
          `${anchor.id}-${neighbour} stays in ${anchor.room} but crosses ${crossing?.opening.id}`);
      } else {
        assert.ok(crossing,
          `${anchor.id}-${neighbour} goes ${anchor.room} -> ${other.room} through solid wall`);
        assert.ok(crossing.opening.rooms.includes(anchor.room)
          && crossing.opening.rooms.includes(other.room),
        `${anchor.id}-${neighbour} crosses ${crossing.opening.id}`);
      }
      const length = Math.hypot(other.x - anchor.x, other.z - anchor.z);
      assert.ok(length < 13, `${anchor.id}-${neighbour} is ${length.toFixed(1)}m in one line`);
    }
  }
});

test('the landing is reachable from every way into the house, on both flights', () => {
  const { pool } = harness();
  const graph = pool.navigator.graph;
  for (const zone of Object.values(STAGING)) {
    if (zone.entry.startsWith('cellar')) continue;
    for (const side of ['east', 'west']) {
      const path = graph.findPath(zone.entry, (anchor) => anchor.zone === 'gallery'
        && (anchor.roles.size === 0 || anchor.roles.has(side)));
      assert.ok(path, `no route from ${zone.id} to the ${side} side of the landing`);
    }
  }
});

test('the cellar pair cannot walk up to the staircase defence', () => {
  /* The corridor encounter happens nine metres under the fight and is over
   * before it starts. A basement anchor joined to the ground floor would let
   * a BFS from the corridor find the gallery, and the two men who are meant
   * to be the opening beat would arrive in the middle of wave one. */
  const { pool } = harness();
  const graph = pool.navigator.graph;
  for (const start of ['cellar_west', 'cellar_vault_door']) {
    assert.equal(graph.findPath(start, (anchor) => anchor.zone === 'gallery'), null);
    assert.equal(graph.findPath(start, (anchor) => anchor.zone === 'foyer'), null);
  }
});
