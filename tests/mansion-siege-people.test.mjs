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

import { ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();

const THREE = await import('three');
const { CombatActor } = await import('../src/core/combat/actors.js');
const { FACTIONS, FactionMatrix } = await import('../src/core/combat/factions.js');
const { MansionDamageState } = await import('../src/mansion/siege/state.js');
const {
  COMBAT_BOUNDARY, ENCOUNTERS, ROLES, STAGING, WaveDirector,
} = await import('../src/mansion/siege/waves.js');
const {
  ANCHORS, OPENINGS, ROOMS, anchorById, crossingFor, laneWaypoints, roomAt,
} = await import('../src/mansion/siege/nav.js');
const {
  createAttackerPool, segmentBlocked, HIT_ZONES, ROLE_PLAN,
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

test('a body falls on the floor he was standing on, not the one he spawned on', () => {
  /* `HeistFigure.fallen()` settles the posed body against `figure.baseY`. A
   * man who came in off the forecourt at y 0 and died six metres up on the
   * gallery settled six metres below the landing -- a body in the foyer
   * ceiling. Both floors, both directions. */
  const { pool } = harness();
  const orders = releaseWave(pool, 'one');
  const floorOf = (entry) => {
    entry.root.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(entry.root).min.y;
  };
  const onTheGallery = pool.entry(orders[0].id);
  onTheGallery.root.position.set(7, 6.0, 49);
  pool.registerHit(onTheGallery.figure.parts.head, 9999);
  assert.ok(Math.abs(floorOf(onTheGallery) - 6.0) < 0.25,
    `he settled at y ${floorOf(onTheGallery).toFixed(2)} instead of on the gallery`);

  const inTheForecourt = pool.entry(orders[1].id);
  inTheForecourt.root.position.set(0, 0, 28);
  pool.registerHit(inTheForecourt.figure.parts.head, 9999);
  assert.ok(Math.abs(floorOf(inTheForecourt)) < 0.25,
    `he settled at y ${floorOf(inTheForecourt).toFixed(2)} instead of on the gravel`);
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
    ['bayEastMid', 'trophyWestSouth']);
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
  const from = { x: 26.5, z: 47.4, y: null };
  const spread = [-1, 0, 1].map((laneT) => laneWaypoints(['lawn_bay', 'bay_glass'], { from, laneT }));
  const [low, mid, high] = spread.map((points) => points[1]);
  /* The leg runs west, so the spread has to be in z. */
  assert.ok(Math.abs(low.z - high.z) > 1.2, `only ${Math.abs(low.z - high.z).toFixed(2)}m apart`);
  assert.ok(Math.abs(low.x - high.x) < 0.01, 'and not along the leg');
  assert.ok(Math.abs(mid.z - 47.4) < 0.01, 'the middle lane is the anchor itself');
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
});

/* ================================================================== */
/* LOCATION-BASED DAMAGE                                                */
/* ================================================================== */

test('a headshot is worth more than a chest and a chest more than a leg', () => {
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
  assert.equal(head / chest, HIT_ZONES.head);
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
  assert.ok(busy.get('aubbie')?.has('tend'), 'Aubbie works on the wounded guard');
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
    'BRIEFING', 'LITTLE_FRIEND', 'WAVE_ONE', 'LULL', 'WAVE_TWO',
    'AFTERMATH', 'TO_SASOLE',
  ]) {
    ensemble.stage(beat);
    const standing = [...ensemble.members.values()].filter((m) => m.root.visible);
    assert.ok(standing.length >= 14, `${beat} staged only ${standing.length} people`);
  }
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
  const catalog = new Set(['revolver', 'pistol9', 'carbine', 'ak47', 'saw', 'barrett']);
  for (const order of orders) {
    const entry = pool.entry(order.id);
    assert.ok(catalog.has(entry.plan.weapon), `${entry.plan.weapon} is not in the catalog`);
    assert.ok(entry.weapon.definition.magazineSize > 0);
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
  assert.equal(pool.root.visible, false, 'the fight is over');
  assert.equal(ensemble.root.visible, true, 'the family is still standing in it');
  damage.apply('post_battle');
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
