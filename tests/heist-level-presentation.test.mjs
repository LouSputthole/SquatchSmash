import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { buildHeistLevel } from '../src/heist/level.js';

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
    .map((state) => civilian.userData.setState(state));
  assert.equal(new Set(poses).size, poses.length, `poses collapsed: ${poses.join(',')}`);
  // Prone lies down; restrained lies down with the arms behind the back.
  civilian.userData.setState('prone');
  const proneArm = civilian.userData.figure.parts.armL.rotation.x;
  civilian.userData.setState('restrained');
  assert.notEqual(civilian.userData.figure.parts.armL.rotation.x, proneArm);
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
