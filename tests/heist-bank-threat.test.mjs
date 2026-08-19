import assert from 'node:assert/strict';
import test from 'node:test';

import { BankGuardThreat } from '../src/heist/bank-threat.js';

test('the testy bank guard can only be stopped by a player shot inside the reaction window', () => {
  const threat = new BankGuardThreat({ windowSeconds: 2.75 });

  assert.equal(threat.start(), true);
  assert.equal(threat.resolve({ source: 'interaction' }).ok, false);
  threat.update(1.4);

  assert.deepEqual(threat.resolve({ source: 'player_shot' }), {
    ok: true,
    event: 'neutralized',
    remaining: 1.35,
  });
  assert.equal(threat.resolve({ source: 'player_shot' }).ok, false);
  assert.equal(threat.snapshot().state, 'neutralized');
});

test('the guard fires at the deadline and a checkpoint retry rebuilds the full threat', () => {
  const threat = new BankGuardThreat({ windowSeconds: 2.75 });
  threat.start();

  assert.deepEqual(threat.update(2.74), { event: null });
  assert.deepEqual(threat.update(0.01), {
    event: 'fired',
    victim: 'lobby_civilian',
  });
  assert.equal(threat.resolve({ source: 'player_shot' }).ok, false);

  threat.reset();
  assert.deepEqual(threat.snapshot(), {
    state: 'idle', elapsed: 0, windowSeconds: 2.75, remaining: 2.75, progress: 0,
  });
  assert.equal(threat.start(), true);
});
