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
