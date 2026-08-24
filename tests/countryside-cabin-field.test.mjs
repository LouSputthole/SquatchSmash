import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CABIN,
  CREEK_PATH,
  LANDMARKS,
  OVERLOOK_TRAIL,
  PROPERTY,
  SURFACE,
  TRAIL_LOOP,
  canPlantTree,
  groundAt,
  hashAt,
  insideProperty,
  normalAt,
  samplePolyline,
  surfaceAt,
  trailFrame,
  treeDensityAt,
} from '../src/cabin/field.js';

test('the cabin property has deterministic walkable footing from yard to ridge', () => {
  const probes = [
    [0, 0],
    [LANDMARKS.trailhead.x, LANDMARKS.trailhead.z],
    [LANDMARKS.creek.x, LANDMARKS.creek.z],
    [LANDMARKS.overlook.x, LANDMARKS.overlook.z],
    [PROPERTY.minX + 5, PROPERTY.maxZ - 5],
  ];

  for (const [x, z] of probes) {
    const first = groundAt(x, z);
    assert.equal(Number.isFinite(first), true, `${x},${z}`);
    assert.equal(groundAt(x, z), first, `${x},${z} must be deterministic`);
    assert.equal(hashAt(x, z, 47), hashAt(x, z, 47));
    const normal = normalAt(x, z);
    assert.ok(Math.abs(Math.hypot(normal.x, normal.y, normal.z) - 1) < 1e-9);
    assert.ok(normal.y > 0, `${x},${z} footing normal must face upward`);
  }

  assert.equal(groundAt(CABIN.main.x0, CABIN.main.z0), CABIN.floorY);
  assert.equal(groundAt(CABIN.main.x1, CABIN.main.z1), CABIN.floorY);
});

test('authored property routes and landmarks remain inside the playable boundary', () => {
  assert.deepEqual(TRAIL_LOOP[0], TRAIL_LOOP.at(-1), 'the property trail must stay a loop');
  assert.ok(TRAIL_LOOP.length >= 16, 'the loop needs enough turns to read as a real walk');
  assert.ok(OVERLOOK_TRAIL.length >= 8, 'the creek-to-ridge spur must stay authored');
  assert.ok(CREEK_PATH.length >= 12, 'the creek must cross the whole property');

  for (const [id, landmark] of Object.entries(LANDMARKS)) {
    assert.equal(insideProperty(landmark.x, landmark.z), true, id);
    assert.ok(landmark.radius > 0, `${id} needs a usable arrival radius`);
  }
  for (const path of [TRAIL_LOOP, OVERLOOK_TRAIL, CREEK_PATH]) {
    for (const point of path) {
      assert.equal(insideProperty(point.x, point.z), true, JSON.stringify(point));
    }
  }

  const sampled = samplePolyline(OVERLOOK_TRAIL, 2.5);
  assert.ok(sampled.length > OVERLOOK_TRAIL.length);
  assert.deepEqual(
    { x: sampled[0].x, z: sampled[0].z },
    OVERLOOK_TRAIL[0],
  );
  assert.deepEqual(
    { x: sampled.at(-1).x, z: sampled.at(-1).z },
    OVERLOOK_TRAIL.at(-1),
  );
});

test('footstep surfaces distinguish the cabin, trail, creek, bridge, firepit, and drive', () => {
  assert.equal(surfaceAt(0, 0), SURFACE.WOOD);
  assert.equal(surfaceAt(LANDMARKS.porch.x, LANDMARKS.porch.z), SURFACE.WOOD);
  assert.equal(surfaceAt(LANDMARKS.trailhead.x, LANDMARKS.trailhead.z), SURFACE.DIRT);
  assert.equal(surfaceAt(24, -32), SURFACE.WATER);
  assert.equal(surfaceAt(LANDMARKS.bridge.x, LANDMARKS.bridge.z), SURFACE.WOOD);
  assert.equal(surfaceAt(LANDMARKS.firepit.x, LANDMARKS.firepit.z), SURFACE.ROCK);
  assert.equal(surfaceAt(LANDMARKS.car.x, LANDMARKS.car.z), SURFACE.GRAVEL);

  assert.equal(canPlantTree(0, 0), false, 'trees cannot grow through the cabin');
  assert.equal(canPlantTree(LANDMARKS.creek.x, LANDMARKS.creek.z), false);
  assert.equal(canPlantTree(LANDMARKS.overlook.x, LANDMARKS.overlook.z), false);
  assert.equal(treeDensityAt(0, 0), 0);
  assert.ok(trailFrame(LANDMARKS.overlook.x, LANDMARKS.overlook.z).distance < 1e-9);
});
