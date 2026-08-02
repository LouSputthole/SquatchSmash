import assert from 'node:assert/strict';
import test from 'node:test';

import { makeMorningGuest } from '../src/world/dressing.js';

function namesUnder(root) {
  const names = [];
  root.traverse((object) => { if (object.name) names.push(object.name); });
  return names;
}

test('morning Margo keeps her canonical authored face in a different outfit', () => {
  const margo = makeMorningGuest({});
  const names = namesUnder(margo.head);

  assert.equal(margo.identity, 'margo');
  assert.equal(margo.outfit, 'morning_blouse_and_jeans');
  assert.ok(names.includes('margo.face.skull'));
  assert.ok(names.includes('margo.face.eye.left'));
  assert.ok(names.includes('margo.face.mouth'));
  assert.ok(names.includes('margo.hair.fall.main'));
});

test('dress help has a composed kneeling pose and articulated silhouette', () => {
  const margo = makeMorningGuest({});
  const names = namesUnder(margo.group);

  assert.ok(names.includes('margo.leg.left.thigh'));
  assert.ok(names.includes('margo.leg.left.shin'));
  assert.ok(names.includes('margo.silhouette.seat.left'));
  assert.ok(names.includes('margo.silhouette.seat.right'));

  margo.setPose('kneeling');
  assert.equal(margo.pose, 'kneeling');
  assert.ok(margo.knees.every((knee) => knee.rotation.x < -1.5));
  assert.equal(margo.helpTarget.visible, true);

  margo.setDressHelpProgress(0.6);
  assert.equal(margo.dressHelpProgress, 0.6);
  assert.ok(margo.dressClosure.scale.y > 0.55);
});
