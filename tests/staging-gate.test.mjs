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
  setActorLandmarks,
  setActorPosture,
  setActorSeat,
} from '../src/core/staging.js';

/* The eye is 1.75, not the marker's 2.30 default.
 *
 * 2.30 is core/person.js's Sasquatch, and every body collider in this file is
 * 1.9 m tall -- which is a fixture that pairs a head with a box the head is
 * not in, and that combination cannot happen in a built scene. It stopped
 * mattering only because nothing measured the two together; once `isOwnBody`
 * started asking whether a solid comes up to the actor's eye, the fixture's
 * own body boxes stopped being its own body. Same mismatch the game had:
 * thirty bodies in the bank lobby declared a 2.300 m eye over irises that
 * measured 1.511 to 1.842. */
const actor = (id, {
  role = 'civilian', yaw = 0, x = 0, z = 0, posture = 'stand', seat, hipY = 1.16, eyeY = 1.75,
} = {}) => ({
  id,
  role,
  posture,
  position: [x, 0, z],
  forward: [Math.sin(yaw), 0, Math.cos(yaw)],
  yaw,
  eye: [x, eyeY, z],
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

test('collectActors excludes actors hidden directly or by an ancestor', async () => {
  const THREE = await import('three');
  const root = new THREE.Group();
  const visible = new THREE.Group();
  const hiddenParent = new THREE.Group();
  const hiddenChild = new THREE.Group();
  markActor(visible, { id: 'visible', role: 'civilian' });
  markActor(hiddenChild, { id: 'hidden-child', role: 'civilian' });
  hiddenParent.visible = false;
  hiddenParent.add(hiddenChild);
  root.add(visible, hiddenParent);
  root.updateMatrixWorld(true);

  assert.deepEqual(collectActors(root, THREE).map(({ id }) => id), ['visible']);
  assert.deepEqual(
    collectActors(root, THREE, { includeHidden: true }).map(({ id }) => id),
    ['visible', 'hidden-child'],
    'the audit inventory can prove a hidden marker was filtered rather than deleted',
  );

  root.visible = false;
  root.updateMatrixWorld(true);
  assert.deepEqual(collectActors(root, THREE), [], 'a hidden scene root has no rendered cast');
  assert.equal(collectActors(root, THREE, { includeHidden: true }).length, 2);
});

test('articulated actors can expose exact eye and hip transforms', async () => {
  const THREE = await import('three');
  const root = new THREE.Group();
  const body = new THREE.Group();
  const eye = new THREE.Group();
  const hip = new THREE.Group();
  body.position.set(2, 0.9, -3);
  body.rotation.set(-Math.PI / 2, -0.6, 0);
  eye.position.set(0.1, 0.74, 0.11);
  hip.position.set(-0.02, 0, -0.01);
  body.add(eye, hip);
  root.add(body);
  markActor(body, {
    id: 'articulated', role: 'principal', posture: 'lie', eyeHeight: 1.6, hipHeight: 0.9,
  });
  setActorLandmarks(body, { eye, hip });
  root.updateMatrixWorld(true);

  const expectedEye = new THREE.Vector3().setFromMatrixPosition(eye.matrixWorld).toArray();
  const expectedHip = new THREE.Vector3().setFromMatrixPosition(hip.matrixWorld).toArray();
  const [found] = collectActors(root, THREE);
  assert.deepEqual(found.eye, expectedEye);
  assert.deepEqual(found.hip, expectedHip);
  assert.notEqual(found.eye[1], body.position.y + 1.6, 'landmarks supersede scalar fallbacks');
  assert.throws(
    () => setActorLandmarks(new THREE.Group(), { eye, hip }),
    /unmarked object/,
  );
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

test('a man is not scenery: his own body collider is not a solid he is inside', () => {
  /* Several scenes register a body box per guest so the player can walk into
   * people. Those boxes are centred on their own actor, so every one of them
   * reported as standing inside a solid -- 82 of the Bing's 106 findings, one
   * fact written out 82 times in an allowlist. */
  const own = box([-0.36, 0, -0.36], [0.36, 1.9, 0.36], 'cast.willy');
  const { findings } = stagingFindings({
    id: 'fixture', actors: [actor('willy', { x: 0, z: 0 })], boxes: [own],
  });
  assert.deepEqual(findings.filter(({ kind }) => kind === 'ACTOR_INSIDE_SOLID'), []);
  assert.deepEqual(findings.filter(({ kind }) => kind === 'FACING_INTO_SOLID'), [],
    'nor does his own chest count as a wall in front of his face');
});

test('but a wall centred near him is still a wall', () => {
  /* Two-part rule on purpose: centred on him AND person-sized. */
  const wall = box([-4, 0, -0.3], [4, 3, 0.3], 'long-wall');
  const { findings } = stagingFindings({
    id: 'fixture', actors: [actor('a', { x: 0, z: 0 })], boxes: [wall],
  });
  assert.equal(findings.filter(({ kind }) => kind === 'ACTOR_INSIDE_SOLID').length, 1);
});

test('and standing inside SOMEBODY ELSE still reports', () => {
  /* This is the fault where two people occupy one spot -- Lag and Numbskull
   * were one body in the Special Meeting until a gate measured it. */
  const other = box([1.64, 0, -0.36], [2.36, 1.9, 0.36], 'cast.numbskull');
  const { findings } = stagingFindings({
    id: 'fixture', actors: [actor('lag', { x: 2, z: 0 })], boxes: [other],
  });
  assert.equal(findings.filter(({ kind }) => kind === 'ACTOR_INSIDE_SOLID').length, 0,
    'centred on him, so it is his own');
  /* 0.30 m off centre, which is twice OWN_BODY_CENTRE_M. The first draft of
   * this test used 0.10 and failed, because 0.10 is INSIDE the threshold --
   * the test was wrong, not the rule. */
  const displaced = stagingFindings({
    id: 'fixture', actors: [actor('lag', { x: 2.3, z: 0 })], boxes: [other] });
  assert.equal(displaced.findings.filter(({ kind }) => kind === 'ACTOR_INSIDE_SOLID').length, 1,
    'a hand-width off centre is another man\'s box, and that is a real finding');
});

/* ------------------------------------------------------------------ *
 * A PERSON IS NOT A WALL, AND A BOOTH IS NOT A WALL EITHER.
 *
 * Measured repo-wide, the facing ray raised 29 findings and 26 of them were
 * the gate's own fault: 24 seated regulars whose heads were inside the booth
 * they were sitting in, and the two men squaring up in bing:attack, each
 * reported as staring at masonry that was in fact the other man. Three were
 * real. These hold the line at three.
 * ------------------------------------------------------------------ */

const bodyBox = (x, z, name) => box([x - 0.24, 0, z - 0.24], [x + 0.24, 1.9, z + 0.24], name);

/* A sitter, with the eye and hip of somebody actually sitting down --
 * measured off the Bing's booth regulars at 1.2 m and 0.71 m. The shared
 * `actor` fixture puts every eye at 2.30 m, which clears a 1.5 m booth
 * outright and would let both booth tests pass without the gate doing
 * anything at all. */
const seatedActor = (id, seat, { yaw = 0, x = 0, z = 0 } = {}) => (
  actor(id, { yaw, x, z, posture: 'sit', seat, hipY: 0.71, eyeY: 1.2 })
);

test('two actors squaring up are not facing a wall', () => {
  // Ape at the origin looking +z at Billy 0.9 m away, and Billy looking back.
  const ape = actor('ape', { yaw: 0, x: 0, z: 0 });
  const billy = actor('billy', { yaw: Math.PI, x: 0, z: 0.9 });
  const { findings } = stagingFindings({
    id: 'fixture',
    actors: [ape, billy],
    boxes: [bodyBox(0, 0, 'cast.ape'), bodyBox(0, 0.9, 'cast.billy')],
  });
  assert.deepEqual(findings.filter(({ kind }) => kind === 'FACING_INTO_SOLID'), []);
});

test('a real wall behind another actor is still a finding', () => {
  // The skip must not blind the ray -- it drops the body and keeps looking.
  const watcher = actor('watcher', { yaw: 0, x: 0, z: 0 });
  const other = actor('other', { yaw: Math.PI, x: 0, z: 0.4 });
  const { findings } = stagingFindings({
    id: 'fixture',
    actors: [watcher, other],
    boxes: [
      bodyBox(0, 0, 'cast.watcher'),
      bodyBox(0, 0.4, 'cast.other'),
      box([-2, 0, 0.6], [2, 3, 0.8], 'wall'),
    ],
  });
  /* Only the watcher: `other` is turned round and has nothing in front of
   * him. The point is that the watcher's ray dropped the body in its way and
   * carried on to the masonry behind it. */
  const wall = findings.filter(({ kind }) => kind === 'FACING_INTO_SOLID');
  assert.equal(wall.length, 1);
  assert.equal(wall[0].id, 'watcher');
  assert.equal(wall[0].solid, 'wall');
});

test('a sitter does not report the booth he is sitting in', () => {
  // A booth is one box from the floor to the top of its back, so a seated
  // head is inside it by construction. He names it, so the ray skips it.
  const booth = { ...box([-1, 0, -1.2], [1, 1.5, 1.2], 'aabb-booth'), assembly: 'bing-booth:east:0' };
  const sitter = seatedActor('regular', 'bing-booth:east:0');
  const { findings } = stagingFindings({
    id: 'fixture',
    actors: [sitter],
    boxes: [booth],
    seats: { 'bing-booth:east:0': { min: { x: -1, y: 0, z: -1.2 }, max: { x: 1, y: 1.5, z: 1.2 } } },
  });
  assert.deepEqual(findings.filter(({ kind }) => kind === 'FACING_INTO_SOLID'), []);
});

test('a sitter still reports the solid he did NOT name', () => {
  // The whole reason the skip is by name: an exemption that guessed which
  // solid was his seat would go on to excuse the sofa he is buried in.
  const booth = { ...box([-1, 0, -1.2], [1, 1.5, 1.2], 'aabb-booth'), assembly: 'bing-booth:east:0' };
  const sofa = { ...box([-1, 0, -1.2], [1, 1.5, 1.2], 'aabb-sofa'), assembly: 'some-other-sofa' };
  const sitter = seatedActor('regular', 'bing-booth:east:0');
  const { findings } = stagingFindings({
    id: 'fixture',
    actors: [sitter],
    boxes: [booth, sofa],
    seats: { 'bing-booth:east:0': { min: { x: -1, y: 0, z: -1.2 }, max: { x: 1, y: 1.5, z: 1.2 } } },
  });
  const facing = findings.filter(({ kind }) => kind === 'FACING_INTO_SOLID');
  assert.equal(facing.length, 1);
  assert.equal(facing[0].solid, 'aabb-sofa');
});

test('two actors standing in the same place is STILL a finding', () => {
  // The facing ray forgives a body; the hip check must not. This is the
  // fault where two rigs are posed into the same cubic metre.
  /* 0.20 m apart: further than OWN_BODY_CENTRE_M, so neither man's collider
   * reads as the other's own, and closer than the collider is wide, so each
   * hip really is inside the other's box. Posed on top of each other at the
   * exact same coordinate they would each claim both boxes as their own and
   * the fault would hide -- which is worth knowing, and is why the numbers
   * here are spelt out. */
  const one = actor('one', { x: 0, z: 0 });
  const two = actor('two', { x: 0.2, z: 0 });
  const { findings } = stagingFindings({
    id: 'fixture',
    actors: [one, two],
    boxes: [bodyBox(0, 0, 'cast.one'), bodyBox(0.2, 0, 'cast.two')],
  });
  const swallowed = findings.filter(({ kind }) => kind === 'ACTOR_INSIDE_SOLID');
  assert.equal(swallowed.length, 2);
});

test('a seat belongs to the sitting, not to the body', () => {
  /* Ape stands at his roster spot in the Bing and sits in the east booth for
   * the cleanup. The marker is frozen, so the pose has to be able to say
   * where it put him -- and standing him back up has to take the seat away
   * again, or that booth goes on being excused from his facing ray on the
   * other side of the room. */
  const node = { userData: {} };
  markActor(node, { id: 'ape', role: 'principal', posture: 'stand' });
  assert.equal(node.userData.actorSeat, undefined);

  setActorPosture(node, 'sit');
  setActorSeat(node, 'bing-booth:east:1');
  assert.equal(node.userData.actorSeat, 'bing-booth:east:1');

  setActorPosture(node, 'stand');
  assert.equal(node.userData.actorSeat, undefined);
});

test('setActorSeat refuses a body nobody has marked', () => {
  assert.throws(() => setActorSeat({ userData: {} }, 'a-booth'), /unmarked/);
});

test('a chair is not the man sitting in it', () => {
  /* THE GATE WENT QUIET AND THE FAULT WAS STILL THERE.
   *
   * The mansion's cinema recliners are collided as one box per chair,
   * measured 1.00 x 0.90 x 0.88 m, and a man sits in the middle of one --
   * lag's mark is 0.02 m off the box centre. Person-sized and centred on him
   * was the whole of the old own-body test, so forty-two ACTOR_INSIDE_SOLID
   * findings across ten mansion states stopped firing while the hips they
   * described were still inside the chairs. The allowlist then reported all
   * forty-two as stale, which reads exactly like the fault having been
   * fixed. Numbers below are the measured ones off mansion:tour. */
  const recliner = box([-7, -2.5, 68.76], [-6, -1.6, 69.64], 'mansion-theatre-recliner-1-collider');
  const sitter = {
    ...actor('oldStove', { posture: 'sit', x: -6.5, z: 69.22 }),
    position: [-6.5, -2.805, 69.22],
    hip: [-6.5, -1.839, 69.22],
    eye: [-6.5, -1.223, 69.22],
  };
  const { findings } = stagingFindings({ id: 'fixture', actors: [sitter], boxes: [recliner] });
  const swallowed = findings.filter(({ kind }) => kind === 'ACTOR_INSIDE_SOLID');
  assert.equal(swallowed.length, 1, 'the chair is furniture, and he is inside it');
  assert.equal(swallowed[0].solid, 'mansion-theatre-recliner-1-collider');
});
