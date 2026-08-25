import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LUXURY_LAYOUT,
  LUXURY_STAIR_RISE,
  luxuryGroundAt,
  luxuryStairProfile,
} from '../src/luxury-apartment/layout.js';

test('luxury apartment uses disjoint main and loft X/Z footprints', () => {
  const { main, loft } = LUXURY_LAYOUT;
  assert.ok(main.z0 > loft.z1, 'main and loft walkable rectangles must not overlap in X/Z');
  assert.equal(luxuryGroundAt(0, (loft.z0 + loft.z1) / 2), LUXURY_LAYOUT.loftY);
  assert.equal(luxuryGroundAt(0, (main.z0 + main.z1) / 2), LUXURY_LAYOUT.mainY);
});

test('luxury stair rises monotonically to the loft in safe deterministic steps', () => {
  const profile = luxuryStairProfile();
  assert.equal(profile.length, LUXURY_LAYOUT.stair.steps + 1);
  assert.equal(profile[0].y, LUXURY_LAYOUT.mainY);
  assert.ok(Math.abs(profile.at(-1).y - LUXURY_LAYOUT.loftY) < 1e-9);
  for (let i = 1; i < profile.length; i++) {
    const rise = profile[i].y - profile[i - 1].y;
    assert.ok(rise > 0 && rise <= 0.40, `stair rise ${i} must be climbable`);
    assert.ok(Math.abs(rise - LUXURY_STAIR_RISE) < 1e-9);
    assert.ok(profile[i].z < profile[i - 1].z);
    assert.equal(luxuryGroundAt((LUXURY_LAYOUT.stair.x0 + LUXURY_LAYOUT.stair.x1) / 2, profile[i].z), profile[i].y);
  }
});
test('outside the stair, the north footprint always resolves to the loft without a floor hint', () => {
  const { loft, stair, loftY } = LUXURY_LAYOUT;
  const x = stair.x1 + 1;
  for (const z of [loft.z0 + 0.1, (loft.z0 + loft.z1) / 2, loft.z1 - 0.1]) {
    assert.equal(luxuryGroundAt(x, z), loftY);
  }
});

test('the under-stair bathroom and elevator resolve the live stacked floor intentionally', () => {
  const {
    bathroom,
    elevatorCab,
    stair,
    mainY,
    loftY,
  } = LUXURY_LAYOUT;
  const bathroomCenter = {
    x: (bathroom.x0 + bathroom.x1) / 2,
    z: (bathroom.z0 + bathroom.z1) / 2,
  };
  const elevatorCenter = {
    x: (elevatorCab.x0 + elevatorCab.x1) / 2,
    z: (elevatorCab.z0 + elevatorCab.z1) / 2,
  };

  for (const point of [bathroomCenter, elevatorCenter]) {
    assert.equal(luxuryGroundAt(point.x, point.z), mainY, 'two-argument fallback is downstairs');
    assert.equal(luxuryGroundAt(point.x, point.z, mainY + 1.66), mainY, 'downstairs eye stays downstairs');
    assert.equal(luxuryGroundAt(point.x, point.z, loftY + 1.66), loftY, 'loft eye stays on the loft');
  }

  assert.ok(bathroom.doorX0 >= stair.x0 && bathroom.doorX1 <= stair.x1,
    'bathroom door remains inside the stair opening');
  assert.ok(stair.z0 - bathroom.z1 >= 0 && stair.z0 - bathroom.z1 <= 0.10,
    'bathroom meets the stair opening without an inaccessible gap');
});
