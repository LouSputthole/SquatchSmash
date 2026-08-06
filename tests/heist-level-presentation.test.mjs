import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { LOBBY_ANCHORS, buildHeistLevel } from '../src/heist/level.js';

test('safehouse reads as a planned job with physical gear instead of appliance placeholders', () => {
  const level = buildHeistLevel(new THREE.Scene());
  const safehouse = level.phases.safehouse.group;

  const lockers = [];
  safehouse.traverse((object) => { if (object.userData.kind === 'prep-locker') lockers.push(object); });
  assert.equal(lockers.length, 3);
  assert.ok(safehouse.getObjectByName('evidence-board'));
  assert.ok(safehouse.getObjectByName('blueprint-route'));
  assert.ok(safehouse.getObjectByName('armor-vest-body'));
  assert.ok(safehouse.getObjectByName('loadout-carbine'));
  assert.ok(safehouse.getObjectByName('loadout-magazines'));
  assert.ok(safehouse.getObjectByName('loadout-duffel'));
});

test('bank actors have articulated silhouettes and a full lobby of hostages', () => {
  const level = buildHeistLevel(new THREE.Scene());
  const { bank } = level.phases;

  assert.ok(bank.interactables.guard.getObjectByName('bank-guard-head'));
  assert.ok(bank.interactables.guard.getObjectByName('bank-guard-gun'));
  assert.ok(bank.interactables.guard.getObjectByName('bank-guard-holster'));
  assert.ok(bank.interactables.manager.getObjectByName('bank-manager-briefcase'));
  assert.equal(bank.civilians.length, 22);
  assert.ok(bank.civilians.every((actor) => actor.userData.hostageId));
  assert.ok(bank.civilians.every((actor) => actor.userData.figure));
});

test('every hostage state produces its own distinct pose', () => {
  const level = buildHeistLevel(new THREE.Scene());
  const civilian = level.phases.bank.civilians[0];
  const poses = ['startled', 'pleading', 'kneeling', 'prone', 'restrained', 'bolting', 'alarm', 'down']
    .map((state) => civilian.userData.setState(state, { blend: false }));
  assert.equal(new Set(poses).size, poses.length, `poses collapsed: ${poses.join(',')}`);
  // Prone lies down; restrained lies down with the arms behind the back.
  civilian.userData.setState('prone', { blend: false });
  const proneArm = civilian.userData.figure.parts.armL.rotation.x;
  civilian.userData.setState('restrained', { blend: false });
  assert.notEqual(civilian.userData.figure.parts.armL.rotation.x, proneArm);
});

test('a takedown is blended across time rather than applied in one frame', () => {
  /* Owner: "takedown animations are shaky." They were applied whole between
   * two frames — a 90 degree rotation of the entire figure with nothing in
   * between, twenty-two at a time when the crowd order lands. */
  const level = buildHeistLevel(new THREE.Scene());
  const civilian = level.phases.bank.civilians[1];
  const figure = civilian.userData.figure;

  civilian.userData.setState('stand', { blend: false });
  const standing = figure.tilt.rotation.x;
  civilian.userData.setState('prone');

  // The state is true immediately: everything that ASKS about this person
  // gets the answer now, whatever the tween is doing.
  assert.equal(civilian.userData.visualState, 'prone');
  // The BODY has not moved yet.
  assert.equal(figure.tilt.rotation.x, standing);

  // A single frame gets it partway, not all the way.
  figure.update(1 / 60, { fear: 0 });
  const afterOneFrame = figure.tilt.rotation.x;
  assert.ok(afterOneFrame > standing, 'the blend did not start');
  assert.ok(afterOneFrame < Math.PI / 2 * 0.5,
    `one frame carried the whole takedown: ${afterOneFrame}`);

  // And it arrives.
  for (let i = 0; i < 90; i++) figure.update(1 / 60, { fear: 0 });
  assert.ok(Math.abs(figure.tilt.rotation.x - Math.PI / 2) < 1e-6,
    `the blend never landed: ${figure.tilt.rotation.x}`);
});

test('a shut vault door is a wall, and opening it takes the wall away', () => {
  /* Owner: "the vault can be walked into before it opens." The bank's
   * collider list had the vault corridor's walls and nothing at all across
   * the 8.4 m doorway they meet at. */
  const level = buildHeistLevel(new THREE.Scene());
  const vault = level.phases.bank.interactables.vault;
  const door = vault.userData.doorCollider;
  assert.ok(door, 'the vault door has no collider');

  level.activate('bank');
  assert.ok(level.world.colliders.includes(door), 'the shut vault door is walk-through');
  // It spans the whole opening between the two rear-wall panels, not just
  // the round disc hanging in it.
  assert.ok(door.max.x - door.min.x >= 8.4, 'the doorway is wider than the door collider');

  vault.userData.setOpen(true);
  assert.ok(!level.world.colliders.includes(door), 'the open vault is still walled off');
  // Re-entering the phase must not put the wall back on an opened vault.
  level.activate('street');
  level.activate('bank');
  assert.ok(!level.world.colliders.includes(door), 'a phase change re-shut the open vault');

  vault.userData.setOpen(false);
  assert.ok(level.world.colliders.includes(door), 'shutting the vault left it walk-through');
});

test('tellers stand clear enough of the counter to lie down behind it', () => {
  /* Owner: "bank teller NPCs clip through the counter." They stood 27 cm
   * behind a solid 85 cm box and lay down ALONG THEIR FACING when ordered,
   * which put 1.7 m of person through the counter, the tills and the glass. */
  const COUNTER_BACK_Z = -2.825;
  const PRONE_LENGTH = 1.7;
  const tellers = LOBBY_ANCHORS.filter((anchor) => anchor.role === 'teller');
  assert.equal(tellers.length, 4);
  for (const teller of tellers) {
    assert.ok(teller.z < COUNTER_BACK_Z, `teller stands inside the counter: z ${teller.z}`);
    // Where the head ends up once they are face down.
    const headZ = teller.z + Math.cos(teller.yaw) * PRONE_LENGTH;
    assert.ok(headZ < COUNTER_BACK_Z,
      `a prone teller reaches through the counter: head at z ${headZ.toFixed(2)}`);
  }
});

test('bank keeps a readable central play lane between the architectural columns', () => {
  const level = buildHeistLevel(new THREE.Scene());
  const columns = [];
  level.phases.bank.group.traverse((object) => {
    if (object.userData.kind === 'bank-column') columns.push(object);
  });

  assert.equal(columns.length, 4);
  assert.ok(columns.every((column) => Math.abs(column.position.x) >= 4),
    `columns choke the center lane: ${columns.map((column) => column.position.x).join(', ')}`);
});

test('escape route has practical lights, readable facades, and a physical pursuit lightbar', () => {
  const level = buildHeistLevel(new THREE.Scene());
  const driving = level.phases.driving.group;
  const practicals = [];
  const windows = [];
  driving.traverse((object) => {
    if (object.userData.kind === 'route-practical') practicals.push(object);
    if (object.userData.kind === 'driving-window-strip') windows.push(object);
  });

  assert.ok(practicals.length >= 12, `only ${practicals.length} route practicals`);
  assert.ok(windows.length >= 20, `only ${windows.length} facade strips`);
  assert.ok(level.phases.driving.pursuit.getObjectByName('pursuit-lightbar-red'));
  assert.ok(level.phases.driving.pursuit.getObjectByName('pursuit-lightbar-blue'));
});
