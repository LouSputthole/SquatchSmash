import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();

const THREE = await import('three');
const {
  INITIATION_CONTROL_MODES,
  InitiationPlayerAdapter,
  KNEELING_EYE_HEIGHT,
  PLAYER_POSES,
  SOFT_ACTOR_RADIUS,
  createInitiationActorCircle,
  createInitiationPlayerWorld,
  syncInitiationActorCircle,
} = await import('../src/initiation/player-adapter.js');
const { OUTDOOR_MEMBER_STATIONS } = await import('../src/initiation/ceremony-layout.js');
const { LINE_UP } = await import('../src/initiation/executions.js');
const { CONTROL_MODES, PHASES } = await import('../src/initiation/phases.js');

function controller() {
  const camera = new THREE.PerspectiveCamera();
  const adapter = new InitiationPlayerAdapter(camera, { bounds: 88 });
  adapter.teleport({ x: 0, z: -30 }, { heading: 0 });
  adapter.setControl(INITIATION_CONTROL_MODES.PLAYABLE);
  adapter.enabled = true;
  return adapter;
}

test('Initiation playable mode uses shared first-person move, mouse-look, and jump', () => {
  const adapter = controller();
  const { player } = adapter;
  const startZ = player.position.z;
  const startYaw = player.yaw;

  assert.equal(adapter.setKey('KeyW', true), true);
  for (let i = 0; i < 30; i++) adapter.update(1 / 60);
  assert.ok(Math.abs(player.position.z - startZ) > 0.5, `W moved only ${Math.abs(player.position.z - startZ)} m`);

  adapter.handleMouseMove(80, -24);
  assert.notEqual(player.yaw, startYaw, 'mouse movement did not rotate the first-person view');
  assert.ok(player.pitch > 0, 'vertical mouse movement did not pitch the first-person view');

  adapter.setKey('KeyW', false);
  adapter.setKey('Space', true);
  adapter.update(1 / 60);
  assert.ok(player.jumpHeight > 0, 'Space did not start the shared Player jump');
});

test('playable-to-playable phase changes preserve a held movement key', () => {
  const adapter = controller();
  const before = adapter.player.position.clone();

  adapter.setKey('KeyW', true);
  adapter.setControl(INITIATION_CONTROL_MODES.PLAYABLE);

  assert.ok(adapter.player.keys.has('KeyW'),
    'a same-mode phase transition dropped the physical key that is still held');
  for (let i = 0; i < 30; i++) adapter.update(1 / 60);
  assert.ok(adapter.player.position.distanceTo(before) > 0.5,
    'Tony stopped walking across a playable-to-playable phase boundary');
});

test('touch joystick forwards its vector and sprint modifier into shared Player keys', () => {
  const adapter = controller();
  const before = adapter.player.position.clone();
  adapter.setTouchVector(0, -1, { sprint: true });

  assert.ok(adapter.player.keys.has('KeyW'));
  assert.ok(adapter.player.keys.has('ShiftLeft'));
  for (let i = 0; i < 20; i++) adapter.update(1 / 60);
  assert.ok(adapter.player.position.distanceTo(before) > 0.4, 'touch forward did not move Tony');

  adapter.setTouchVector(0, 0);
  assert.ok(!adapter.player.keys.has('KeyW'));
  assert.ok(!adapter.player.keys.has('ShiftLeft'));
});

test('canonical suspension overrides active touch until the input lifecycle resumes', () => {
  const adapter = controller();
  adapter.setTouchActive(true);
  adapter.setTouchVector(0, -1, { sprint: true });
  assert.equal(adapter.player.enabled, true);
  assert.ok(adapter.player.keys.has('KeyW'));

  adapter.setInputSuspended(true);
  adapter.enabled = false;
  assert.equal(adapter.player.enabled, false,
    'touch mode bypassed the canonical suspended lifecycle');
  assert.equal(adapter.player.keys.size, 0, 'suspension left touch movement held');

  adapter.setTouchVector(0, -1, { sprint: true });
  adapter.setTouchButton('Space', true);
  assert.equal(adapter.player.keys.size, 0, 'suspended touch handlers restored held input');

  adapter.setInputSuspended(false);
  assert.equal(adapter.player.enabled, true,
    'resuming canonical input did not restore the active touch control channel');
});

test('procession policy keeps shared movement but removes keyboard and touch sprint', () => {
  const adapter = controller();
  adapter.setKey('KeyW', true);
  adapter.setKey('ShiftLeft', true);
  assert.ok(adapter.player.keys.has('ShiftLeft'), 'default gameplay unexpectedly blocked sprint');

  adapter.setMovementPolicy({ moveScale: 0.78, allowSprint: false });
  assert.equal(adapter.player.moveScale, 0.78);
  assert.equal(adapter.moveScale, 0.78);
  assert.equal(adapter.allowSprint, false);
  assert.ok(adapter.player.keys.has('KeyW'), 'pacing policy dropped the held walk key');
  assert.ok(!adapter.player.keys.has('ShiftLeft'), 'pacing policy left a held sprint key active');

  assert.equal(adapter.setKey('ShiftRight', true), true, 'blocked sprint was not handled as movement input');
  assert.ok(!adapter.player.keys.has('ShiftRight'), 'keyboard sprint bypassed procession policy');
  adapter.setTouchVector(0, -1, { sprint: true });
  assert.ok(adapter.player.keys.has('KeyW'));
  assert.ok(!adapter.player.keys.has('ShiftLeft'), 'touch sprint bypassed procession policy');

  adapter.setMovementPolicy();
  assert.equal(adapter.player.moveScale, 1);
  assert.equal(adapter.allowSprint, true);
});

test('execution look-only mode preserves free look while locking translation at kneeling height', () => {
  const adapter = controller();
  adapter.teleport({ x: -2.2, z: -8 }, { heading: 0 });
  adapter.setControl(INITIATION_CONTROL_MODES.LOOK_ONLY, { pose: PLAYER_POSES.KNEELING });
  adapter.enabled = true;
  const before = adapter.player.position.clone();
  const yaw = adapter.player.yaw;

  assert.equal(adapter.setKey('KeyW', true), false, 'look-only accepted a movement key');
  adapter.handleMouseMove(60, 0);
  adapter.update(0.25);

  assert.equal(adapter.player.position.x, before.x);
  assert.equal(adapter.player.position.z, before.z);
  assert.equal(adapter.player.position.y, KNEELING_EYE_HEIGHT);
  assert.notEqual(adapter.player.yaw, yaw, 'look-only disabled the requested execution free-look');
});

test('authored cutscene mode clears input and freezes the shared Player camera', () => {
  const adapter = controller();
  adapter.setKey('KeyW', true);
  adapter.setControl(INITIATION_CONTROL_MODES.CUTSCENE);
  adapter.enabled = true;
  const before = adapter.player.position.clone();
  const yaw = adapter.player.yaw;

  adapter.handleMouseMove(120, 0);
  adapter.update(0.5);

  assert.equal(adapter.player.enabled, false);
  assert.equal(adapter.player.keys.size, 0);
  assert.deepEqual(adapter.player.position.toArray(), before.toArray());
  assert.equal(adapter.player.yaw, yaw);
});

test('the Initiation Player world resolves site circles and authored bounds through its circle seam', () => {
  const world = createInitiationPlayerWorld({ circles: [{ x: 0, z: 0, r: 1 }], bounds: 5 });
  const fake = { position: new THREE.Vector3(0, 1.66, 0), velocity: new THREE.Vector3(2, 0, 2) };

  world.resolvePlayer(fake, 'x', 0.3);
  assert.equal(fake.position.x, 1.3);
  assert.equal(fake.velocity.x, 0);

  fake.position.set(9, 1.66, -9);
  world.resolvePlayer(fake, 'x', 0.3);
  world.resolvePlayer(fake, 'z', 0.3);
  assert.equal(fake.position.x, 5);
  assert.equal(fake.position.z, -5);
  assert.deepEqual(world.colliders, [], 'site and actor circles should not leak into the AABB collider list');
});

test('soft actor collision follows a live rig and disables during authored motion or falls', () => {
  const figure = {
    position: new THREE.Vector3(2, 0, -4),
    group: { visible: true },
  };
  const circle = createInitiationActorCircle(figure);
  assert.equal(circle.r, SOFT_ACTOR_RADIUS);
  assert.ok(circle.r >= 0.32 && circle.r <= 0.45, 'actor collision grew back into a roadblock');
  assert.deepEqual([circle.x, circle.z, circle.active], [2, -4, true]);

  figure.position.set(-3, 0, 7);
  syncInitiationActorCircle(circle, figure);
  assert.deepEqual([circle.x, circle.z, circle.active], [-3, 7, true]);

  syncInitiationActorCircle(circle, figure, { active: false });
  assert.equal(circle.active, false);
  figure.group.visible = false;
  syncInitiationActorCircle(circle, figure);
  assert.equal(circle.active, false);
});

function segmentDistance(a, b, point) {
  const vx = b.x - a.x;
  const vz = b.z - a.z;
  const lengthSquared = vx * vx + vz * vz;
  const t = Math.max(0, Math.min(1,
    ((point.x - a.x) * vx + (point.z - a.z) * vz) / lengthSquared));
  return Math.hypot(point.x - (a.x + vx * t), point.z - (a.z + vz * t));
}

test('the full forest approach has a deterministic person-width aisle into Tony slot', () => {
  const spawn = { x: 0, z: -78 };
  const playerSlot = { ...LINE_UP.find((slot) => slot.player), z: -8 };
  const blockers = [
    ...OUTDOOR_MEMBER_STATIONS.map(({ key, x, z }) => ({ id: key, x, z })),
    ...LINE_UP.filter((slot) => !slot.player).map((slot) => ({
      id: slot.victim ?? slot.name,
      x: slot.x,
      z: slot.z ?? -8,
    })),
  ];

  for (const blocker of blockers) {
    const clearance = segmentDistance(spawn, playerSlot, blocker);
    assert.ok(clearance >= 1.45, `${blocker.id} pinches the aisle to ${clearance.toFixed(2)} m`);
  }
});

test('the entire Initiation stays first person, including the cabin ritual', () => {
  for (const name of [
    'approach', 'line_up', 'walk_out', 'trail', 'cabin_arrive', 'cabin_door',
    'ceremony_approach',
  ]) {
    assert.equal(PHASES[name].control, CONTROL_MODES.PLAYABLE, `${name} is not playable first person`);
  }
  for (const name of ['mass_kneel', 'execution_sweep', 'player_aim', 'lou_interrupt']) {
    assert.equal(PHASES[name].control, CONTROL_MODES.LOOK_ONLY, `${name} is not stationary free-look`);
    assert.equal(PHASES[name].playerPose, PLAYER_POSES.KNEELING, `${name} does not lower Tony to his knees`);
  }
  for (const name of [
    'ceremony', 'oath_question', 'oath_yes', 'blade', 'hand', 'cut', 'card',
    'oath_1', 'oath_2', 'burn', 'made', 'room', 'room_aside', 'pullback',
  ]) {
    assert.equal(PHASES[name].control, CONTROL_MODES.LOOK_ONLY,
      `${name} took the camera away from the player`);
  }
  assert.equal(PHASES.ceremony_approach.objective, 'Stand before Uncle Lou');
  assert.deepEqual(PHASES.ceremony_approach.exits, ['ceremony']);
});
