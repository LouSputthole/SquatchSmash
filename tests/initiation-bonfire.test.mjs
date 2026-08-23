import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const { buildExecutionGround } = await import('../src/initiation/cabin/execution-ground.js');
const { buildInitiationCabinSite } = await import('../src/initiation/cabin/index.js');
const { OUTDOOR_MEMBER_STATIONS } = await import('../src/initiation/ceremony-layout.js');
const { BONFIRE, PLAYER_SLOT } = await import('../src/initiation/cabin/site.js');

function named(root, name) {
  const found = [];
  root.traverse((object) => { if (object.name === name) found.push(object); });
  return found;
}

test('the clearing has one grounded bonfire with fire, smoke, and moving shadow light', () => {
  const built = buildExecutionGround({ cars: [] });
  assert.equal(named(built.group, 'clearing.bonfire').length, 1);
  assert.equal(named(built.group, 'barrel.body').length, 0);
  assert.equal(named(built.group, 'bonfire.ring.stone').length, 14);
  assert.equal(named(built.group, 'bonfire.log').length, 4);
  assert.equal(named(built.group, 'bonfire.flame').length, 4);
  assert.equal(named(built.group, 'bonfire.smoke').length, 1);
  const [light] = named(built.group, 'bonfire.light');
  assert.ok(light);
  assert.equal(light.castShadow, true);
  assert.ok(light.intensity >= 50);
  const before = light.intensity;
  built.update(0.17);
  assert.notEqual(light.intensity, before);
  const fireCollider = built.colliders.find(({ x, z }) => x === BONFIRE.x && z === BONFIRE.z);
  assert.ok(fireCollider);
  assert.ok(fireCollider.r >= BONFIRE.radius + 0.3);
  assert.ok(Math.hypot(BONFIRE.x - PLAYER_SLOT.x, BONFIRE.z - PLAYER_SLOT.z) > 5.5,
    'the fire is an anchor beside the ceremony, not an aisle blocker');
  for (const station of OUTDOOR_MEMBER_STATIONS) {
    assert.ok(
      Math.hypot(BONFIRE.x - station.x, BONFIRE.z - station.z) >= fireCollider.r + 0.42,
      `${station.name} must stand around the bonfire, not inside it`,
    );
  }
});

test('the site update Interface drives the bonfire rather than leaving it static', () => {
  const site = buildInitiationCabinSite({ woods: false, cabin: false });
  const [light] = named(site.root, 'bonfire.light');
  const before = light.intensity;
  site.update(0.21);
  assert.notEqual(light.intensity, before);
  site.dispose();
});
