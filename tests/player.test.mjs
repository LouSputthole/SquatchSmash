import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Player } from '../src/core/player.js';

test('layInBed supersedes an unfinished posture tween and its stale callback', () => {
  const player = new Player(new THREE.PerspectiveCamera(), {
    colliders: [],
    floorZones: [],
  });
  let staleCallbacks = 0;
  player.lieDown({
    position: new THREE.Vector3(4, 0.7, -2),
    yaw: 0.35,
    dur: 1.3,
  }, () => { staleCallbacks++; });

  const wakePosition = { x: -1.5, y: 0.82, z: 3.25 };
  const wakeYaw = -0.6;
  player.layInBed(wakePosition, wakeYaw);
  player.update(10);

  assert.equal(staleCallbacks, 0);
  assert.equal(player._tween, null);
  assert.equal(player.mode, 'bed');
  assert.deepEqual(player.position.toArray(), [wakePosition.x, wakePosition.y, wakePosition.z]);
  assert.equal(player.yaw, wakeYaw);
});

test('exact authored-floor mode follows a discrete support without changing the default easing contract', () => {
  let floorY = 0;
  const make = (snapGroundToSurface) => {
    const player = new Player(new THREE.PerspectiveCamera(), {
      colliders: [],
      floorZones: [],
      snapGroundToSurface,
      groundAt: () => floorY,
    });
    player.enabled = true;
    player.mode = 'walk';
    player.ground = 0;
    player.position.set(0, player.eyeHeight, 0);
    return player;
  };
  const exact = make(true);
  const eased = make(false);

  floorY = 0.2;
  exact.update(1 / 60);
  eased.update(1 / 60);

  assert.equal(exact.ground, floorY,
    'exact-floor player still enters a newly reached tread');
  assert.ok(Math.abs((exact.position.y - exact.eyeHeight) - floorY) <= 1e-12);
  assert.ok(eased.ground > 0 && eased.ground < floorY,
    'default player no longer preserves its original vertical easing');

  floorY = 0;
  exact.update(1 / 60);
  assert.equal(exact.ground, 0,
    'exact-floor player floats after stepping down');
});
