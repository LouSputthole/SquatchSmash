import assert from 'node:assert/strict';
import test from 'node:test';
import { createObjectiveGuideClock, objectiveMarkerPosition } from '../src/core/objective-guide-state.js';

const viewport = { width: 1280, height: 720, fov: 70, aspect: 1280 / 720 };
test('direction stays on screen in front, at the sides, and directly behind the player', () => {
  const front = objectiveMarkerPosition({ x: 0, y: 0, z: -10 }, viewport);
  assert.equal(front.onScreen, true);
  assert.equal(front.x, 640);
  for (const point of [{ x: 20, y: 0, z: -1 }, { x: -20, y: 0, z: 1 }, { x: 0, y: 0, z: 10 }, { x: 0, y: 30, z: 0 }]) {
    const p = objectiveMarkerPosition(point, viewport);
    assert.equal(p.onScreen, false);
    assert.ok(p.x > 0 && p.x < viewport.width && p.y > 0 && p.y < viewport.height);
  }
  assert.equal(objectiveMarkerPosition({ x: NaN, y: 0, z: 0 }, viewport), null);
});
test('assistance waits for active play, resets on progress, and can be requested immediately', () => {
  const clock = createObjectiveGuideClock();
  const tick = (overrides = {}) => clock.update({ step: 'find-car', distance: 20, active: true, dt: 0.25, ...overrides });
  for (let i = 0; i < 300; i++) assert.equal(tick({ active: false }), false);
  for (let i = 0; i < 179; i++) assert.equal(tick(), false);
  assert.equal(tick(), true);
  assert.equal(tick({ distance: 15 }), false);
  clock.reveal();
  assert.equal(tick({ distance: 15 }), true);
  clock.clear();
  assert.equal(tick({ step: 'next-objective' }), false);
});
