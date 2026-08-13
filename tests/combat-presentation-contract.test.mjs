import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { resolveCombatFeedback } from '../src/core/combat/feedback.js';
import { resolveCombatReaction } from '../src/core/combat/impairments.js';
import { choosePalaceCombatPosition } from '../src/cartel-palace/security.js';
import { CombatArmorPresentation } from '../src/world/combat-armor.js';
import { BallisticImpactSystem } from '../src/world/impacts.js';

function installCanvasStub() {
  const previous = globalThis.document;
  const gradient = { addColorStop() {} };
  const context = {
    createRadialGradient: () => gradient,
    fillRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
    moveTo() {}, lineTo() {},
    set fillStyle(_) {}, set strokeStyle(_) {}, set lineWidth(_) {},
  };
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => context }),
  };
  return () => { globalThis.document = previous; };
}

test('combat feedback distinguishes bearing, armor absorption, armor break and fatal damage', () => {
  const listener = new THREE.Vector3(0, 0, 0);
  const front = resolveCombatFeedback({
    damage: 8,
    absorbed: 6,
    armorBroken: false,
    fatal: false,
    fromPosition: new THREE.Vector3(0, 0, 10),
    listenerPosition: listener,
    listenerYaw: 0,
  });
  assert.equal(front.kind, 'armor-hit');
  assert.equal(front.sector, 'front');
  assert.ok(Number.isFinite(front.bearing));

  assert.equal(resolveCombatFeedback({
    damage: 8, absorbed: 6, armorBroken: true, fromPosition: new THREE.Vector3(10, 0, 0),
    listenerPosition: listener, listenerYaw: 0,
  }).kind, 'armor-break');
  assert.equal(resolveCombatFeedback({
    damage: 100, fatal: true, fromPosition: new THREE.Vector3(0, 0, -10),
    listenerPosition: listener, listenerYaw: 0,
  }).kind, 'fatal');
  assert.equal(resolveCombatFeedback({
    damage: 8, fromPosition: new THREE.Vector3(-10, 0, 0),
    listenerPosition: listener, listenerYaw: 0,
  }).sector, 'left');
});

test('opposite shot directions create mirrored bounded reactions and fatal falls', () => {
  const left = resolveCombatReaction({
    direction: new THREE.Vector3(1, 0, 0), actorYaw: 0, fatal: true,
  });
  const right = resolveCombatReaction({
    direction: new THREE.Vector3(-1, 0, 0), actorYaw: 0, fatal: true,
  });
  assert.equal(left.side, -right.side);
  assert.equal(Math.sign(left.roll), -Math.sign(right.roll));
  assert.ok(Math.abs(left.roll) <= 0.8 && Math.abs(right.roll) <= 0.8);
  assert.notEqual(left.fall, right.fall);

  const front = resolveCombatReaction({
    direction: new THREE.Vector3(0, 0, 1), actorYaw: 0, fatal: false,
  });
  const back = resolveCombatReaction({
    direction: new THREE.Vector3(0, 0, -1), actorYaw: 0, fatal: false,
  });
  assert.equal(Math.sign(front.forward), -Math.sign(back.forward));
});

test('armor presentation has a readable plate silhouette, breaks once and restores from actor state', () => {
  const scene = new THREE.Scene();
  const body = new THREE.Group();
  scene.add(body);
  const actor = { armor: 45, maxArmor: 45 };
  const armor = new CombatArmorPresentation({ body, actor, tier: 'heavy' });

  const ready = armor.report();
  assert.equal(ready.state, 'armored');
  assert.ok(ready.visiblePlates >= 2);
  assert.ok(ready.width > 0.34, 'the plate carrier did not change the body silhouette');

  actor.armor = 0;
  assert.equal(armor.applyResult({ armorBroken: true, absorbed: 12 }), true);
  assert.equal(armor.applyResult({ armorBroken: true, absorbed: 1 }), false,
    'one armor break emitted twice');
  assert.equal(armor.report().state, 'broken');

  actor.armor = 20;
  armor.restore();
  assert.equal(armor.report().state, 'armored');
  armor.dispose();
});

test('surface impacts keep exact points and normals in bounded material pools', () => {
  const restoreDocument = installCanvasStub();
  try {
    const scene = new THREE.Scene();
    const audio = { calls: [], play(name, options) { this.calls.push({ name, options }); } };
    const impacts = new BallisticImpactSystem(scene, { audio, capacity: 4, random: () => 0.25 });
    const point = new THREE.Vector3(1, 1.5, -2);
    const normal = new THREE.Vector3(0, 0, 1);

    const wood = impacts.hit({ point, normal, direction: normal.clone().negate(), material: 'wood', energy: 0.7 });
    assert.deepEqual(wood.point.toArray(), point.toArray());
    assert.deepEqual(wood.normal.toArray(), normal.toArray());
    assert.equal(wood.material, 'wood');
    assert.equal(wood.mark.visible, true);
    assert.equal(audio.calls.at(-1).name, 'combat.bullet.impact.wood');

    impacts.hit({ point, normal, material: 'metal', energy: 0.7 });
    impacts.hit({ point, normal, material: 'plaster', energy: 0.7 });
    impacts.hit({ point, normal, material: 'concrete', energy: 0.7 });
    impacts.hit({ point, normal, material: 'wood', energy: 0.7 });
    assert.equal(impacts.visibleCount <= 4, true);
    assert.equal(impacts.report().capacity, 4);

    const beforeFlesh = impacts.visibleCount;
    assert.equal(impacts.hit({ point, normal, material: 'flesh' }), null,
      'blood-owned flesh received a world bullet hole');
    assert.equal(impacts.visibleCount, beforeFlesh);
    impacts.reset();
    assert.equal(impacts.visibleCount, 0);
    impacts.dispose();
  } finally {
    restoreDocument();
  }
});

test('Palace tactical choice avoids reservations and preserves boss authored anchors', () => {
  const space = { move() {}, trace: () => null };
  const posts = [
    { id: 'left-cover', kind: 'cover', position: new THREE.Vector3(-4, 0, 2), score: 1 },
    { id: 'right-flank', kind: 'flank', position: new THREE.Vector3(5, 0, 3), score: 0.8 },
  ];
  const target = new THREE.Vector3(0, 0, 10);
  const guard = { id: 'guard-a', role: 'guard', root: { position: new THREE.Vector3() } };
  const first = choosePalaceCombatPosition({
    entry: guard, target, posts, reservations: new Set(), space,
  });
  assert.equal(first.post.id, 'left-cover');
  const second = choosePalaceCombatPosition({
    entry: guard, target, posts, reservations: new Set(['left-cover']), space,
  });
  assert.equal(second.post.id, 'right-flank');

  const boss = { id: 'mark', role: 'boss', root: { position: new THREE.Vector3() } };
  assert.equal(choosePalaceCombatPosition({
    entry: boss, target, posts, reservations: new Set(), space,
  }), null, 'the tactical selector moved Mark off his authored boss phase');
});
