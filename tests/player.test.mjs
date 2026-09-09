import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Player } from '../src/core/player.js';
import { markSpatialPrimitive } from '../src/core/spatial-contract.js';

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

test('typed triggers can share the spatial inventory without becoming runtime walls', () => {
  const trigger = new THREE.Box3(
    new THREE.Vector3(-1, 0, -1),
    new THREE.Vector3(1, 3, 1),
  );
  markSpatialPrimitive(trigger, { id: 'mission.start', kind: 'trigger' });
  const player = new Player(new THREE.PerspectiveCamera(), {
    colliders: [trigger], floorZones: [],
  });
  player.position.set(0, player.eyeHeight, 0);
  player._resolve('x');
  player._resolve('z');
  assert.deepEqual(player.position.toArray(), [0, player.eyeHeight, 0]);
});

test('a sit tween below grade keeps eyeHeight a height above the floor, not a world Y', () => {
  /* The mansion theatre. Owner, 2026-09-09: "When you sit in the theatre of
   * the mansion the room dissapears." The tween wrote `position.y` into
   * `eyeHeight` — the same number only on a floor at y = 0, which was every
   * earlier sittable scene. On the theatre's -2.8 floor it wrote -1.56, the
   * feet (`position.y - eyeHeight`) read back 0.0 — a ground-storey foot
   * height — and the room-visibility pass culled the theatre around the
   * seated player. Real numbers from the seat the repro used: floor -2.8,
   * seat pose eye -1.56, measured ground -2.778. */
  const player = new Player(new THREE.PerspectiveCamera(), {
    colliders: [],
    floorZones: [],
  });
  player.mode = 'walk';
  player.ground = -2.778;
  player.position.set(-6.5, -2.778 + 1.66, 72.6);
  let seated = false;
  player.sitAt({
    position: new THREE.Vector3(-6.5, -1.56, 71.94),
    yaw: Math.PI,
    pitch: 0,
    dur: 0.75,
  }, () => { seated = true; });
  player.update(1); // the whole tween

  assert.equal(seated, true);
  assert.equal(player.mode, 'seated');
  assert.ok(Math.abs(player.eyeHeight - 1.218) < 1e-9,
    `eyeHeight is the seated eye's height over the floor, got ${player.eyeHeight}`);
  assert.ok(Math.abs((player.position.y - player.eyeHeight) - (-2.778)) < 1e-9,
    'so the feet keep reading the floor he sat down on');
});
