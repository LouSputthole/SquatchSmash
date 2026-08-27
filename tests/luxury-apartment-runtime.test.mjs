import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureDomShim();
ensureThreeShim();

const THREE = await import('three');
const { Player } = await import('../src/core/player.js');
const { Inventory } = await import('../src/core/inventory.js');
const {
  LuxuryAnsweringMachineRuntime,
  LuxuryCrookedArtRuntime,
  LuxuryDarts,
  LuxuryInventoryRuntime,
  LuxuryToiletRuntime,
} = await import('../src/luxury-apartment/runtime.js');

function quietObject(overrides = {}) {
  return new Proxy(overrides, {
    get(target, key) {
      if (key in target) return target[key];
      return () => {};
    },
  });
}

function toiletFixture() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(68, 1, 0.05, 100);
  scene.add(camera);
  const floorY = 3.30;
  const playerWorld = { colliders: [], floorZones: [], groundAt: () => floorY };
  const player = new Player(camera, playerWorld);
  player.position.set(-4.30, floorY + 1.66, -5.95);
  player.mode = 'walk';
  player.enabled = true;
  const world = {
    colliders: [],
    groundAt: () => floorY,
    toiletBowl: new THREE.Vector3(-4.30, floorY + 0.40, -6.78),
    toiletBowlRadius: 0.19,
    toiletWaterY: floorY + 0.31,
    toiletCollider: new THREE.Box3(
      new THREE.Vector3(-4.54, floorY, -7.22),
      new THREE.Vector3(-4.06, floorY + 0.84, -6.50),
    ),
    toiletLid: new THREE.Group(),
    toiletSeatPivot: new THREE.Group(),
    toiletFloorY: floorY,
    toiletSeat: new THREE.Vector3(-4.30, floorY + 0.98, -6.74),
    toiletStand: new THREE.Vector3(-4.30, floorY, -5.95),
  };
  const interaction = quietObject({ paused: false, setPaused(value) { this.paused = value; } });
  const hud = quietObject();
  const audio = quietObject();
  const runtime = new LuxuryToiletRuntime({
    scene,
    camera,
    player,
    world,
    interaction,
    hud,
    audio,
    isPointerLocked: () => true,
  });
  return { runtime, player, world, interaction };
}

test('luxury free-aim toilet mode keeps mouse look live while movement is pinned', () => {
  const { runtime, player, world, interaction } = toiletFixture();
  assert.equal(runtime.startAim(), true);
  assert.equal(runtime.mode, 'aim');
  assert.equal(player.mode, 'aim');
  const yaw = player.yaw;
  player.handleMouseMove(18, -6);
  assert.notEqual(player.yaw, yaw, 'aim mode must not inherit Player frozen-mode mouse suppression');
  const report = runtime.stopAim({ quiet: true });
  assert.ok(report);
  assert.equal(runtime.mode, null);
  assert.equal(player.mode, 'walk');
  assert.equal(player.position.y, world.toiletFloorY + 1.66);
  assert.equal(interaction.paused, false);
});

test('luxury seated toilet reaches the live W A S D rhythm and can be solved', () => {
  const { runtime, player } = toiletFixture();
  runtime.setBowel(1);
  assert.equal(runtime.startSeat(), true);
  for (let i = 0; i < 90 && runtime.mode !== 'seat'; i++) player.update(1 / 60);
  assert.equal(runtime.mode, 'seat');
  assert.equal(runtime.solvePushes(), true);
  const report = runtime.report();
  assert.ok(report.pushes.hits >= 8);
  assert.equal(report.pushes.misses, 0);
  assert.ok(report.progress >= 0.98);
  assert.equal(runtime.stopSeat(), true);
  assert.equal(player.mode, 'walk');
});

test('luxury crooked-art controller completes the eight-hit TimingBar', () => {
  const interaction = quietObject({ paused: false, setPaused(value) { this.paused = value; } });
  const hud = quietObject();
  let crookedness = 1;
  const art = { setCrookedness(value) { crookedness = value; } };
  const runtime = new LuxuryCrookedArtRuntime({ art, interaction, hud, audio: quietObject() });
  assert.equal(runtime.start(), true);
  assert.equal(runtime.solve(), true);
  assert.equal(crookedness, 0);
  const report = runtime.report();
  assert.deepEqual({
    active: report.active,
    completed: report.completed,
    hits: report.hits,
    total: report.total,
    attempts: report.attempts,
    misses: report.misses,
    accuracy: report.accuracy,
  }, {
    active: false,
    completed: true,
    hits: 8,
    total: 8,
    attempts: 8,
    misses: 0,
    accuracy: 1,
  });
  assert.equal(report.view.hits, 8);
  assert.equal(interaction.paused, false);
});

test('luxury answering machine and physical darts expose complete deterministic play loops', () => {
  const world = {
    state: { answeringMachinePlaying: false },
    setMessagesWaiting(value) { this.messagesWaiting = value; },
  };
  const machine = new LuxuryAnsweringMachineRuntime({ world, hud: quietObject(), audio: quietObject() });
  assert.equal(machine.toggle(true), true);
  while (machine.playing) machine.advance();
  const messageReport = machine.report();
  assert.equal(messageReport.heard, true);
  assert.equal(messageReport.waiting, 0);
  assert.equal(messageReport.transcript.length, 2);

  const scene = new THREE.Scene();
  const dartsCamera = new THREE.PerspectiveCamera(68, 1, 0.05, 100);
  scene.add(dartsCamera);
  const darts = new LuxuryDarts({
    scene,
    camera: dartsCamera,
    hud: quietObject(),
    audio: quietObject(),
  });
  darts.enter();
  assert.equal(dartsCamera.fov, 50, 'entering darts narrows the camera for a readable board');
  dartsCamera.fov = 68;
  darts.update(1 / 60);
  assert.equal(dartsCamera.fov, 50, 'darts reapplies its authored view after the shared focus effect');
  const tripleTwenty = darts.scoreImpact(darts.board.center.clone()
    .addScaledVector(darts.board.up, darts.board.radius * 0.58));
  assert.deepEqual({ score: tripleTwenty.score, label: tripleTwenty.label }, { score: 60, label: 'T20' });
  const launch = darts.throwAtBoard({ power: 12 });
  assert.equal(launch.launched, true);
  assert.ok(launch.velocity.y > 0, 'the compensated throw has a real ballistic arc');
  for (let i = 0; darts.inFlight && i < 480; i++) darts.update(1 / 240);
  assert.equal(darts.inFlight, null);
  assert.equal(darts.lastImpact.target, 'dartboard');
  assert.equal(darts.lastImpact.score, 50);
  assert.equal(darts.throws, 1);
  assert.equal(darts.projectiles.length, 1, 'a scored dart remains visibly stuck');
  darts.reset();
  assert.equal(darts.throws, 0);
  assert.equal(darts.projectiles.length, 0);
  darts.leave();
  assert.equal(darts.active, false);
  assert.equal(dartsCamera.fov, 68, 'leaving darts restores the walking camera');
});

test('luxury cigarette pack replenishes, reports full state, and can restore a consumed pack', () => {
  const camera = new THREE.PerspectiveCamera(68, 1, 0.05, 100);
  const inventory = new Inventory(5);
  const toasts = [];
  const runtime = new LuxuryInventoryRuntime({
    camera,
    inventory,
    hud: quietObject({ toast(message) { toasts.push(message); } }),
    audio: quietObject(),
    phone: { canvas: document.createElement('canvas'), screen: 'home' },
  });
  runtime.seed();

  assert.equal(inventory.has('phone'), false, 'the get-ready phone stays in the apartment until picked up');
  assert.deepEqual(runtime.status('cigs'), {
    id: 'cigs', owned: true, count: 6, max: 12, full: false,
  });
  const replenished = runtime.replenish('cigs', { amount: 6, max: 12 });
  assert.equal(replenished.added, 6);
  assert.equal(replenished.full, true);
  const alreadyFull = runtime.replenish('cigs', { amount: 6, max: 12 });
  assert.equal(alreadyFull.added, 0);
  assert.equal(alreadyFull.reason, 'already-full');
  assert.ok(toasts.includes('You already have a full pack'), 'full interaction gives explicit feedback');

  assert.equal(inventory.remove('cigs'), true);
  runtime.counts.cigs = 0;
  const restored = runtime.replenish('cigs', { amount: 6, max: 12 });
  assert.equal(restored.owned, true);
  assert.equal(restored.count, 6);
  assert.equal(restored.added, 6);
});
