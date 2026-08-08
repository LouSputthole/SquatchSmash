import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureDomShim } from '../tools/three-shim.mjs';

ensureDomShim();

const { buildMansionGrounds } = await import('../src/mansion/scenes/MansionGrounds.js');
const { buildMansionInterior } = await import('../src/mansion/scenes/MansionInterior.js');
const {
  MANSION_RETURN_REPORT,
  mansionVisitMode,
} = await import('../src/mansion/campaign.js');

test('the quiet-evening guest bed is an exposed physical interaction target', () => {
  const grounds = buildMansionGrounds(null);
  const interior = buildMansionInterior({ grounds });

  assert.ok(interior.props.guestRoom.bed?.isObject3D);
  assert.match(interior.props.guestRoom.bed.name, /guest.*bed/i);
});

test('the repaired return visit is explicit and carries only approved briefing facts', () => {
  assert.equal(mansionVisitMode({ search: '?visit=return' }), 'return');
  assert.equal(mansionVisitMode({ search: '?preview=1' }), 'silent_squatch');
  assert.deepEqual(MANSION_RETURN_REPORT, {
    wrongCityConfirmed: true,
    sauceMissingConfirmed: true,
    palaceLocationKnown: true,
  });
  assert.ok(Object.isFrozen(MANSION_RETURN_REPORT));
});
