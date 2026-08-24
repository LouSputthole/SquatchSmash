import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CABIN,
  CREEK_PATH,
  LANDMARKS,
  LANDMARK_VIEWPOINTS,
  OVERLOOK_TRAIL,
  PROPERTY,
  SURFACE,
  TRAIL_LOOP,
  canPlantTree,
  groundAt,
  hashAt,
  insideProperty,
  insideOverlookViewCorridor,
  normalAt,
  samplePolyline,
  slopeAt,
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

test('trail centre grades stay walkable and preserve a tree-free route corridor', () => {
  const maximumGrade = 0.28;
  for (const [name, path] of [['loop', TRAIL_LOOP], ['overlook', OVERLOOK_TRAIL]]) {
    const sampled = samplePolyline(path, 0.5);
    for (let i = 0; i < sampled.length; i++) {
      const point = sampled[i];
      assert.equal(insideProperty(point.x, point.z, 0.35), true, `${name} boundary at ${i}`);
      assert.equal(canPlantTree(point.x, point.z, 0.35), false, `${name} clearance at ${i}`);
      if (!i) continue;
      const previous = sampled[i - 1];
      const distance = Math.hypot(point.x - previous.x, point.z - previous.z);
      const grade = Math.abs(groundAt(point.x, point.z) - groundAt(previous.x, previous.z)) / distance;
      assert.ok(grade <= maximumGrade, `${name} grade ${grade.toFixed(3)} at ${i}`);
    }
  }
});

test('landmark observation viewpoints are safe, grounded approaches with an open ridge view', () => {
  for (const [id, viewpoint] of Object.entries(LANDMARK_VIEWPOINTS)) {
    assert.equal(insideProperty(viewpoint.x, viewpoint.z, 2), true, id);
    assert.ok(Number.isFinite(viewpoint.lookX) && Number.isFinite(viewpoint.lookZ), `${id} look target`);
    assert.ok(slopeAt(viewpoint.x, viewpoint.z, 0.75) < 0.20, `${id} footing slope`);
    assert.ok(
      Math.hypot(viewpoint.x - LANDMARKS[id].x, viewpoint.z - LANDMARKS[id].z) < 7,
      `${id} remains a practical interaction approach`,
    );
  }

  const origin = LANDMARKS.overlook;
  const midpoint = {
    x: origin.x + (LANDMARKS.cabin.x - origin.x) * 0.48,
    z: origin.z + (LANDMARKS.cabin.z - origin.z) * 0.48,
  };
  assert.equal(insideOverlookViewCorridor(midpoint.x, midpoint.z), true);
  assert.equal(canPlantTree(midpoint.x, midpoint.z, 0.4), false, 'the overlook sightline stays open');
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
  assert.ok(trailFrame(
    LANDMARK_VIEWPOINTS.overlook.x,
    LANDMARK_VIEWPOINTS.overlook.z,
  ).distance < 1e-9);
  assert.ok(trailFrame(LANDMARKS.overlook.x, LANDMARKS.overlook.z).distance < 4.5);
});
