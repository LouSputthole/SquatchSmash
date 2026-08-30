import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();
globalThis.window ??= {};
Object.assign(globalThis.window, {
  innerWidth: 1280,
  innerHeight: 720,
  devicePixelRatio: 1,
  __squatchStage: () => {},
});
globalThis.window.location ??= { search: '', pathname: '/', href: '' };
globalThis.fetch ??= async () => ({ ok: false, status: 404, json: async () => null });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVICE_KEYS = ['waiter', 'mover1', 'mover2', 'server0', 'server1', 'server2', 'runner'];

async function buildActiveDiningRoom() {
  const THREE = await import('three');
  const { buildSilverRuntimeEnvironment } = await import('../src/silver/runtime-geometry.js');
  const runtime = buildSilverRuntimeEnvironment(new THREE.Scene(), { renderer: null });
  const { room } = runtime;
  room.frontTable.group.visible = true;
  room.frontTable.group.position.copy(room.anchors.frontTable);
  room.frontTable.chairs.forEach((chair, index) => {
    const seat = room.anchors.frontSeats[index];
    chair.visible = true;
    chair.position.set(seat.x, 0, seat.z);
    chair.rotation.y = seat.yaw;
  });
  room.syncFrontTableNav(true);
  return { THREE, ...runtime };
}

function serviceStaff(cast) {
  return SERVICE_KEYS.map((key) => {
    assert.ok(cast.byName[key], `missing service worker ${key}`);
    assert.equal(cast.byName[key].serviceStaff, true, `${key} does not negotiate waiter right-of-way`);
    return [key, cast.byName[key]];
  });
}

test('every Silver service round clears the real room, front table, chairs, diners, and tray footprint', async () => {
  const { cast } = await buildActiveDiningRoom();
  const { serviceLegClear } = await import('../src/silver/service-navigation.js');

  for (const [key, npc] of serviceStaff(cast)) {
    assert.ok(npc.route?.length > 1, `${key} has no authored service round`);
    for (let index = 0; index < npc.route.length; index++) {
      const from = npc.route[index];
      const to = npc.route[(index + 1) % npc.route.length];
      assert.equal(
        serviceLegClear(npc, from, to, { people: cast.all }),
        true,
        `${key} route leg ${index} crosses a structural collider, seated diner, or table fixture`,
      );
    }
  }
});

test('the featured waiter can reach both service marks from every point in his real patrol', async () => {
  const { THREE, room, cast } = await buildActiveDiningRoom();
  const {
    planAuthoredServiceRoute, serviceLegClear, servicePointClear, SERVICE_STOP_DISTANCE,
  } = await import('../src/silver/service-navigation.js');
  const waiter = cast.byName.waiter;
  const patrol = waiter.route.map(({ x, z }) => new THREE.Vector3(x, 0, z));
  const targets = [
    new THREE.Vector3(room.anchors.frontTable.x + 1.1, 0, room.anchors.frontTable.z + 1.0),
    new THREE.Vector3(room.anchors.frontTable.x + 1.2, 0, room.anchors.frontTable.z + 1.4),
  ];

  for (const start of patrol) {
    for (const target of targets) {
      waiter.group.position.copy(start);
      const route = planAuthoredServiceRoute(waiter, cast.serviceNetwork, target, {
        from: start,
        people: cast.all,
      });
      assert.ok(route, `no physical table route from (${start.x}, ${start.z})`);
      for (let index = 1; index < route.length; index++) {
        assert.equal(
          serviceLegClear(waiter, route[index - 1], route[index], { people: cast.all }),
          true,
          `planned table leg ${index - 1} is not actually clear`,
        );
      }

      /* Exercise the shared Npc follower too. It rounds a waypoint once it is
       * within 40 cm; testing only ideal line segments would miss a body/tray
       * cutting the inside of a tight corner. */
      waiter.route = route.map((mark) => mark.clone());
      waiter.routeAt = 0;
      waiter.job = 'patrol';
      waiter.speed = 1.22;
      waiter._acc = 0;
      let arrived = false;
      for (let frame = 0; frame < 45 * 30; frame++) {
        waiter.update(1 / 30, target);
        assert.equal(
          servicePointClear(waiter, waiter.group.position, { people: [] }),
          true,
          `the real follower clipped furniture from (${start.x}, ${start.z}) `
            + `to (${target.x}, ${target.z}) at `
            + `(${waiter.group.position.x.toFixed(3)}, ${waiter.group.position.z.toFixed(3)}); `
            + `route ${route.map((mark) => `(${mark.x},${mark.z})`).join(' -> ')}`,
        );
        if (waiter.group.position.distanceTo(target) <= SERVICE_STOP_DISTANCE) {
          arrived = true;
          break;
        }
      }
      assert.equal(arrived, true, `waiter did not reach (${target.x}, ${target.z}) from (${start.x}, ${start.z})`);
    }
  }
});

test('Silver service workers patrol and cross without persistent stalls or furniture clipping', async () => {
  const { THREE, cast } = await buildActiveDiningRoom();
  const { serviceAdvanceAllowed } = await import('../src/silver/cast.js');
  const { servicePointClear } = await import('../src/silver/service-navigation.js');
  const workers = serviceStaff(cast);
  const player = new THREE.Vector3(0, 1.66, 0);
  const progress = new Map(workers.map(([key, npc]) => [key, {
    last: npc.group.position.clone(), distance: 0, stillFor: 0, maxStill: 0,
  }]));
  let closestCrossing = {
    clearance: Infinity, distance: Infinity, required: 0, pair: null, frame: -1,
  };
  const dt = 1 / 30;

  for (let frame = 0; frame < 90 / dt; frame++) {
    for (const npc of cast.all) {
      if (serviceAdvanceAllowed(npc, cast.all, dt)) npc.update(dt, player);
    }
    for (const [key, npc] of workers) {
      assert.equal(
        servicePointClear(npc, npc.group.position, { people: [] }),
        true,
        `${key} entered structural furniture at frame ${frame} `
          + `(${npc.group.position.x.toFixed(3)}, ${npc.group.position.z.toFixed(3)}) `
          + `on route mark ${npc.routeAt}`,
      );
      const state = progress.get(key);
      const moved = Math.hypot(
        npc.group.position.x - state.last.x,
        npc.group.position.z - state.last.z,
      );
      state.distance += moved;
      state.stillFor = moved > 0.001 ? 0 : state.stillFor + dt;
      state.maxStill = Math.max(state.maxStill, state.stillFor);
      state.last.copy(npc.group.position);
    }
    for (let left = 0; left < workers.length; left++) {
      for (let right = left + 1; right < workers.length; right++) {
        const [leftKey, leftNpc] = workers[left];
        const [rightKey, rightNpc] = workers[right];
        const distance = Math.hypot(
          leftNpc.group.position.x - rightNpc.group.position.x,
          leftNpc.group.position.z - rightNpc.group.position.z,
        );
        const required = leftNpc.serviceRadius + rightNpc.serviceRadius;
        const clearance = distance - required;
        if (clearance < closestCrossing.clearance) {
          closestCrossing = {
            clearance, distance, required, pair: `${leftKey}/${rightKey}`, frame,
          };
        }
      }
    }
  }

  for (const [key] of workers) {
    const state = progress.get(key);
    assert.ok(state.distance > 8, `${key} did not complete meaningful patrol movement (${state.distance.toFixed(2)}m)`);
    assert.ok(state.maxStill < 5, `${key} remained blocked for ${state.maxStill.toFixed(2)}s`);
  }
  assert.ok(
    closestCrossing.clearance >= -0.02,
    `${closestCrossing.pair} overlapped at ${closestCrossing.distance.toFixed(2)}m `
      + `(needs ${closestCrossing.required.toFixed(2)}m) `
      + `(frame ${closestCrossing.frame})`,
  );
});

test('the featured waiter and table carriers physically rejoin their own patrols after service', async () => {
  const { THREE, room, cast } = await buildActiveDiningRoom();
  const {
    planServiceReturn, servicePointClear, SERVICE_STOP_DISTANCE,
  } = await import('../src/silver/service-navigation.js');
  const cases = [
    ['waiter', new THREE.Vector3(room.anchors.frontTable.x + 1.1, 0, room.anchors.frontTable.z + 1.0)],
    ['mover1', new THREE.Vector3(room.anchors.frontSeats[0].x, 0, room.anchors.frontSeats[0].z + 1.05)],
    ['mover2', new THREE.Vector3(room.anchors.frontSeats[1].x, 0, room.anchors.frontSeats[1].z + 1.05)],
  ];

  for (const [key, start] of cases) {
    const npc = cast.byName[key];
    const home = npc.route.map(({ x, z }) => new THREE.Vector3(x, 0, z));
    npc.group.position.copy(start);
    const planned = planServiceReturn(npc, cast.serviceNetwork, home, { people: cast.all });
    assert.ok(planned, `${key} has no physical return to its patrol`);
    npc.route = planned.route.map((mark) => mark.clone());
    npc.routeAt = 0;
    npc.job = 'patrol';
    npc.speed = 1.25;
    npc._acc = 0;
    let arrived = false;
    for (let frame = 0; frame < 45 * 30; frame++) {
      npc.update(1 / 30, planned.target);
      assert.equal(
        servicePointClear(npc, npc.group.position, { people: [] }),
        true,
        `${key} clipped furniture returning at `
          + `(${npc.group.position.x.toFixed(3)}, ${npc.group.position.z.toFixed(3)})`,
      );
      if (npc.group.position.distanceTo(planned.target) <= SERVICE_STOP_DISTANCE) {
        arrived = true;
        break;
      }
    }
    assert.equal(arrived, true, `${key} never rejoined patrol mark ${planned.joinAt}`);
  }
});

test('the other-table champagne chain reacts, dispatches, appears, and only then retires', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/silver/main.js'), 'utf8');
  const queue = source.slice(source.indexOf('function runSeatedQueue'), source.indexOf('/**\n * Bring somebody to the table.'));
  const champagne = source.slice(source.indexOf('function sendChampagne'), source.indexOf('function presentChampagne'));
  const presentation = source.slice(source.indexOf('function presentChampagne'), source.indexOf('/* ---- two: the band ---- */'));

  assert.ok(queue.indexOf('const started =') < queue.indexOf('queueAt++'),
    'the queue still retires an entry before attempting its dispatch');
  const failedAt = queue.indexOf('if (started === false)');
  const retryReturnAt = queue.indexOf('return;', failedAt);
  assert.ok(failedAt >= 0 && retryReturnAt > failedAt && retryReturnAt < queue.indexOf('queueAt++'),
    'a blocked service dispatch must remain pending');
  assert.ok(champagne.indexOf('const trip = walkServiceToTable') < champagne.indexOf('champagneSent = true'),
    'champagne is still marked sent before a physical route exists');
  assert.match(champagne, /if \(!trip\)[\s\S]*return false;/,
    'failed champagne routing must report failure to the queue');
  assert.match(champagne, /departIn: 1\.25/,
    'the sending table and waiter need a visible handoff before he walks');
  assert.ok(champagne.indexOf('glanceOver(sender') < champagne.indexOf('champagneSent = true'),
    'the other table must visibly react before the event is retired');
  assert.ok(
    presentation.indexOf('tableService.champagne.visible = true')
      < presentation.indexOf('champagneComplete = true'),
    'the bottle must physically appear before the event completes',
  );
  assert.ok(presentation.indexOf('glanceOver(bouncer') < presentation.indexOf('champagneComplete = true'),
    'the sending table must answer the waiter before the next beat unlocks');
});

test('an actually blocked service floor fails explicitly instead of inventing a teleport', async () => {
  const { THREE, room, cast } = await buildActiveDiningRoom();
  const { planAuthoredServiceRoute } = await import('../src/silver/service-navigation.js');
  const waiter = cast.byName.waiter;
  waiter.colliders = [
    ...waiter.colliders,
    new THREE.Box3(
      new THREE.Vector3(-40, -0.1, -30),
      new THREE.Vector3(10, 2.2, 30),
    ),
  ];
  const target = new THREE.Vector3(
    room.anchors.frontTable.x + 1.2,
    0,
    room.anchors.frontTable.z + 1.4,
  );
  const before = waiter.group.position.clone();
  assert.equal(
    planAuthoredServiceRoute(waiter, cast.serviceNetwork, target, { people: cast.all }),
    null,
  );
  assert.deepEqual(waiter.group.position.toArray(), before.toArray(),
    'routing failure moved the waiter instead of leaving the queue pending');
});
