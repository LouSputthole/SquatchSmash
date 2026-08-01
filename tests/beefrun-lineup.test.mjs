import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateLineupGate } from '../src/beefrun/lineup-gate.js';

test('an airborne player cannot remain softlocked in the runway lineup phase', () => {
  const gate = evaluateLineupGate({
    distance: 1000,
    headingError: 90,
    groundSpeed: 30,
    onGround: false,
    agl: 20,
    airspeedKnots: 65,
  });

  assert.deepEqual(gate, { airborne: true, ready: true });
});
