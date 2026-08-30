import assert from 'node:assert/strict';
import test from 'node:test';

import {
  APE_EXIT_ROUTE,
  APE_RETURN_ROUTE,
  HOTDOG_ATTACK_HIT_COUNT,
  HOTDOG_MAX_HIP_BUCKLE,
  HOTDOG_MAX_KNEE_BUCKLE,
  HOTDOG_MAX_TORSO_HINGE,
  createHotDogAttack,
} from '../src/bing/hotdog-attack.js';

function rig(x, z) {
  const part = () => ({ rotation: { x: 0, z: 0 } });
  return {
    group: { position: { x, z } },
    job: 'patrol',
    route: [{ x: 99, z: 99 }],
    parts: {
      body: part(),
      head: part(),
      armR: part(),
      foreR: part(),
      armL: part(),
      foreL: part(),
      legL: part(),
      legR: part(),
      shinL: part(),
      shinR: part(),
    },
  };
}

function segmentTouchesRect(a, b, { minX, maxX, minZ, maxZ }) {
  let enter = 0;
  let exit = 1;
  for (const [axis, min, max] of [['x', minX, maxX], ['z', minZ, maxZ]]) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < 1e-9) {
      if (a[axis] < min || a[axis] > max) return false;
      continue;
    }
    const first = (min - a[axis]) / delta;
    const last = (max - a[axis]) / delta;
    enter = Math.max(enter, Math.min(first, last));
    exit = Math.min(exit, Math.max(first, last));
    if (enter > exit) return false;
  }
  return true;
}

test('Ape exit and return marks detour around the solid two-top', () => {
  const twoTopEnvelope = {
    minX: -14.15, maxX: -12.65,
    minZ: 0.45, maxZ: 1.65,
  };
  const paths = [
    [{ x: -14.2, z: 0.2 }, ...APE_EXIT_ROUTE],
    APE_RETURN_ROUTE,
  ];
  for (const path of paths) {
    for (let i = 1; i < path.length; i += 1) {
      assert.equal(segmentTouchesRect(path[i - 1], path[i], twoTopEnvelope), false,
        `route leg ${i - 1} -> ${i} must not cut through the two-top`);
    }
  }
  assert.ok(APE_EXIT_ROUTE.length >= 3, 'exit keeps a deliberate detour before the return beat');
  assert.ok(APE_RETURN_ROUTE.length >= 2, 'return keeps a distinct route back to the confrontation');
});

test('the local HotDog cinematic lands four beatable impacts before allowing cleanup', () => {
  const ape = rig(-14.9, -0.25);
  const hotdog = rig(-15.8, -0.45);
  const knife = { visible: false, rotation: { x: 0, z: 0 } };
  const impacts = [];
  let completion = null;
  const attack = createHotDogAttack({
    ape,
    hotdog,
    knife,
    onImpact: (impact) => impacts.push(impact),
    onComplete: (result) => { completion = result; },
  });

  assert.equal(attack.start(), true);
  assert.equal(attack.start(), false, 'one incident cannot overlap itself');
  assert.equal(ape.route, null);
  assert.equal(hotdog.route, null);
  assert.equal(knife.visible, true);

  let maxTorsoHinge = 0;
  let maxHipBuckle = 0;
  let maxKneeBuckle = 0;
  for (let i = 0; i < 200 && attack.active; i += 1) {
    attack.update(0.02);
    maxTorsoHinge = Math.max(maxTorsoHinge, Math.abs(hotdog.parts.body.rotation.x));
    maxHipBuckle = Math.max(maxHipBuckle, Math.abs(hotdog.parts.legL.rotation.x));
    maxKneeBuckle = Math.max(maxKneeBuckle, Math.abs(hotdog.parts.shinL.rotation.x));
  }

  assert.equal(attack.active, false);
  assert.equal(attack.landed, HOTDOG_ATTACK_HIT_COUNT);
  assert.deepEqual(impacts.map(({ hit }) => hit), [1, 2, 3, 4]);
  assert.deepEqual(impacts.map(({ final }) => final), [false, false, false, true]);
  assert.deepEqual(completion, { hits: HOTDOG_ATTACK_HIT_COUNT });
  assert.notEqual(ape.parts.armR.rotation.x, 0, 'impact keeps Ape in an authored strike pose');
  assert.ok(maxTorsoHinge <= HOTDOG_MAX_TORSO_HINGE + 1e-9,
    `torso hinge ${maxTorsoHinge} exceeds the connected waist limit`);
  assert.ok(maxHipBuckle > HOTDOG_MAX_HIP_BUCKLE * 0.7,
    'accumulated damage transfers into the hips instead of tearing the torso away');
  assert.ok(maxKneeBuckle > HOTDOG_MAX_KNEE_BUCKLE * 0.7,
    'the knees absorb the late-strike collapse');
});
