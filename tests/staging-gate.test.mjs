/**
 * THE CAST HAS TO BE STANDING IN THE SCENE THE WAY IT WAS WRITTEN.
 *
 * The geometry gate proves the room is built right. Nothing proved the PEOPLE
 * in it were, which is why the owner kept having to be the one to notice:
 * "they are all looking forward at the same spot", "they are standing in the
 * seats", "the cops spawned behind me instead of in front of me". Each of
 * those is one line of arithmetic over a built scene, and this holds the
 * arithmetic.
 *
 * The gate is pure, so these are pure: fixtures in, findings out. The runner
 * that feeds it real scenes is tools/verify-staging.mjs.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FACING_WALL_DISTANCE_M,
  SEAT_HIP_TOLERANCE_M,
  UNIFORM_YAW_MIN_GROUP,
  angleDelta,
  rayBoxDistance,
  stagingFindings,
} from '../tools/staging-gate.mjs';
import {
  ACTOR_POSTURES,
  ACTOR_ROLE_FOR_SCENE_ROLE,
  ACTOR_ROLES,
  coarseActorRole,
  collectActors,
  markActor,
  readActor,
  setActorPosture,
} from '../src/core/staging.js';

const actor = (id, { role = 'civilian', yaw = 0, x = 0, z = 0, posture = 'stand', seat, hipY = 1.16 } = {}) => ({
  id,
  role,
  posture,
  position: [x, 0, z],
  forward: [Math.sin(yaw), 0, Math.cos(yaw)],
  yaw,
  eye: [x, 2.3, z],
  hip: [x, hipY, z],
  actor: { id, role, posture, ...(seat ? { seat } : {}) },
});

const box = (min, max, name = null) => ({ name, min, max });

test('angleDelta wraps the short way round', () => {
  assert.ok(Math.abs(angleDelta(0.1, -0.1) - 0.2) < 1e-9);
  // 175° and -175° are ten degrees apart, not three hundred and fifty.
  assert.ok(Math.abs(Math.abs(angleDelta(3.0, -3.0)) - (2 * Math.PI - 6)) < 1e-9);
});

test('rayBoxDistance misses a box the ray runs parallel to', () => {
  const wall = box([-1, 0, 5], [1, 3, 5.2]);
  assert.equal(rayBoxDistance([0, 1, 0], [1, 0, 0], wall), Infinity);
  assert.equal(rayBoxDistance([0, 1, 0], [0, 0, 1], wall), 5);
  // A box entirely behind the origin is not a hit.
  assert.equal(rayBoxDistance([0, 1, 9], [0, 0, 1], wall), Infinity);
});

test('a rank of actors sharing one yaw is a finding, and the cohort names them', () => {
  const actors = [1, 2, 3, 4].map((n) => actor(`c${n}`, { yaw: Math.PI, x: n * 1.2 }));
  const { findings } = stagingFindings({ id: 'fixture', actors });
  const uniform = findings.filter(({ kind }) => kind === 'FACING_UNIFORM');
  assert.equal(uniform.length, 1);
  assert.deepEqual(uniform[0].cohort, ['c1', 'c2', 'c3', 'c4']);
});

test('a few degrees of human variance clears it', () => {
  const offsets = [-0.05, 0.21, -0.28, 0.13];
  const actors = offsets.map((offset, n) => actor(`c${n}`, { yaw: Math.PI + offset, x: n * 1.2 }));
  const { findings } = stagingFindings({ id: 'fixture', actors });
  assert.deepEqual(findings.filter(({ kind }) => kind === 'FACING_UNIFORM'), []);
});

test('actors too far apart to be a formation are not one', () => {
  const actors = [0, 40, 80].map((x, n) => actor(`c${n}`, { yaw: Math.PI, x }));
  const { findings } = stagingFindings({ id: 'fixture', actors });
  assert.deepEqual(findings.filter(({ kind }) => kind === 'FACING_UNIFORM'), []);
});

test('one fewer than the minimum group is left alone', () => {
  assert.equal(UNIFORM_YAW_MIN_GROUP, 3);
  const actors = [0, 1].map((n) => actor(`c${n}`, { yaw: 1, x: n }));
  const { findings } = stagingFindings({ id: 'fixture', actors });
  assert.deepEqual(findings.filter(({ kind }) => kind === 'FACING_UNIFORM'), []);
});

test('an actor with his nose on a wall is reported, and one across the room is not', () => {
  const wall = box([-4, 0, 0.5], [4, 3, 0.7], 'lobby-wall');
  const near = stagingFindings({ id: 'fixture', actors: [actor('a', { yaw: 0, z: 0 })], boxes: [wall] });
  const [found] = near.findings.filter(({ kind }) => kind === 'FACING_INTO_SOLID');
  assert.ok(found, 'a wall half a metre from the face is a finding');
  assert.equal(found.solid, 'lobby-wall');
  assert.ok(found.distanceM < FACING_WALL_DISTANCE_M);

  const far = stagingFindings({ id: 'fixture', actors: [actor('a', { yaw: 0, z: -6 })], boxes: [wall] });
  assert.deepEqual(far.findings.filter(({ kind }) => kind === 'FACING_INTO_SOLID'), []);
});

test('a man inside the vault door is inside it', () => {
  const leaf = box([2, 0, -7], [4, 3, -5], 'vault-leaf');
  const { findings } = stagingFindings({
    id: 'fixture',
    actors: [actor('manager', { role: 'principal', x: 3, z: -6 })],
    boxes: [leaf],
  });
  const [found] = findings.filter(({ kind }) => kind === 'ACTOR_INSIDE_SOLID');
  assert.ok(found);
  assert.equal(found.solid, 'vault-leaf');
});

test('sitting means hips at cushion height, not hovering over it', () => {
  const seats = { 'van-bench-left': box([-1, 0, -1], [1, 0.5, 1]) };
  const standing = stagingFindings({
    id: 'fixture',
    actors: [actor('crew', { role: 'crew', posture: 'sit', seat: 'van-bench-left', hipY: 1.16 })],
    seats,
  });
  const [found] = standing.findings.filter(({ kind }) => kind === 'SEAT_STANDING');
  assert.ok(found, 'hips 66 cm over the cushion is standing on the bench');
  assert.ok(found.aboveCushionM > SEAT_HIP_TOLERANCE_M);

  const seated = stagingFindings({
    id: 'fixture',
    actors: [actor('crew', { role: 'crew', posture: 'sit', seat: 'van-bench-left', hipY: 0.62 })],
    seats,
  });
  assert.deepEqual(seated.findings.filter(({ kind }) => kind === 'SEAT_STANDING'), []);
});

test('a seat that was renamed out from under its rider is a finding, not a pass', () => {
  const { findings } = stagingFindings({
    id: 'fixture',
    actors: [actor('crew', { role: 'crew', posture: 'sit', seat: 'bench-that-moved' })],
    seats: {},
  });
  assert.equal(findings.filter(({ kind }) => kind === 'SEAT_MISSING').length, 1);
});

test('a wave that arrives behind the player is reported', () => {
  const player = { position: [0, 0, 0], yaw: 0 };
  const behind = stagingFindings({
    id: 'fixture',
    actors: [actor('cop', { role: 'enemy', z: -12 })],
    player,
  });
  assert.equal(behind.findings.filter(({ kind }) => kind === 'SPAWN_BEHIND_PLAYER').length, 1);

  const ahead = stagingFindings({
    id: 'fixture',
    actors: [actor('cop', { role: 'enemy', z: 12 })],
    player,
  });
  assert.deepEqual(ahead.findings.filter(({ kind }) => kind === 'SPAWN_BEHIND_PLAYER'), []);
});

test('only enemies are held to the forward arc', () => {
  const { findings } = stagingFindings({
    id: 'fixture',
    actors: [actor('bystander', { role: 'bystander', z: -12 })],
    player: { position: [0, 0, 0], yaw: 0 },
  });
  assert.deepEqual(findings.filter(({ kind }) => kind === 'SPAWN_BEHIND_PLAYER'), []);
});

test('two actors sharing an id is a finding: allowlists key on the id', () => {
  const { findings } = stagingFindings({
    id: 'fixture',
    actors: [actor('twin', { x: 0 }), actor('twin', { x: 9 })],
  });
  assert.equal(findings.filter(({ kind }) => kind === 'ACTOR_ID_DUPLICATE').length, 1);
});

test('the marker refuses a body it cannot describe', () => {
  assert.throws(() => markActor({}, { id: '', role: 'crew' }), /non-empty id/);
  assert.throws(() => markActor({}, { id: 'a', role: 'goblin' }), /unknown role/);
  assert.throws(() => markActor({}, { id: 'a', role: 'crew', posture: 'slouch' }), /unknown posture/);
  assert.throws(() => markActor({}, { id: 'a', role: 'crew', faceAxis: '+y' }), /unknown faceAxis/);
  assert.throws(() => markActor({}, { id: 'a', role: 'crew', lookAt: [1, 2] }), /three finite numbers/);
  assert.throws(() => setActorPosture({ userData: {} }, 'sit'), /unmarked object/);
});

test('the marker is frozen, and posture is the one thing that moves', () => {
  const object = markActor({ userData: {} }, { id: 'a', role: 'crew' });
  assert.equal(readActor(object).posture, 'stand');
  assert.throws(() => { readActor(object).role = 'enemy'; }, TypeError);
  setActorPosture(object, 'sit');
  assert.equal(object.userData.actorPosture, 'sit');
  // The authored fact is untouched; the live one moved.
  assert.equal(readActor(object).posture, 'stand');
  assert.ok(ACTOR_POSTURES.includes('sit'));
});

test('collectActors reads the live posture, not the authored one', async () => {
  const THREE = await import('three');
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.rotation.y = Math.PI / 2;
  root.add(body);
  markActor(body, { id: 'rider', role: 'crew', seat: 'bench' });
  setActorPosture(body, 'sit');
  root.updateMatrixWorld(true);

  const [collected] = collectActors(root, THREE);
  assert.equal(collected.id, 'rider');
  assert.equal(collected.posture, 'sit');
  // Face axis is local +Z, so a quarter turn about Y points him down +X.
  assert.ok(Math.abs(collected.forward[0] - 1) < 1e-6);
  assert.ok(Math.abs(collected.yaw - Math.PI / 2) < 1e-6);
});

test("a scene's own role word never stops the scene from building", () => {
  /* This is the regression. `role: 'performer'` went straight into markActor,
   * which threw, which took the whole Bing build down and 46 tests with it.
   * Strictness belongs on the authored call, not on the translation. */
  assert.equal(coarseActorRole('performer'), 'bystander');
  assert.equal(coarseActorRole('family_member'), 'crew');
  assert.equal(coarseActorRole('lobby_guard'), 'guard');
  assert.equal(coarseActorRole('a word nobody has mapped'), 'bystander');
  assert.equal(coarseActorRole(undefined), 'bystander');
});

test('every mapped scene role lands on a role the gate knows', () => {
  for (const [sceneRole, coarse] of Object.entries(ACTOR_ROLE_FOR_SCENE_ROLE)) {
    assert.ok(ACTOR_ROLES.includes(coarse), `${sceneRole} maps to unknown role ${coarse}`);
  }
});

test('the marker does not name the node it marks', () => {
  /* The geometry gate groups assemblies BY NAME. An earlier draft named any
   * unnamed object `actor:<id>`, which re-bucketed every anonymous figure
   * group in the Bing. */
  const object = markActor({ userData: {} }, { id: 'nameless', role: 'crew' });
  assert.equal(object.name, undefined);
  const named = markActor({ userData: {}, name: 'kept' }, { id: 'other', role: 'crew' });
  assert.equal(named.name, 'kept');
});
