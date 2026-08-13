import assert from 'node:assert/strict';
import test from 'node:test';

import { rayHitContractError } from '../tools/no-wake-evidence-contract.mjs';

test('NO WAKE evidence accepts any articulated child only when its exact cast owner matches', () => {
  const expectation = {
    pattern: 'hips|waist|torso|forearm|thigh|gut|belly',
    characterId: 'willy',
  };
  assert.equal(rayHitContractError(expectation, {
    name: 'person.gut.belly', characterId: 'willy',
  }), null);
  assert.match(rayHitContractError(expectation, {
    name: 'person.gut.belly', characterId: 'lou',
  }), /expected willy/);
  assert.match(rayHitContractError(expectation, {
    name: 'dinette table top', characterId: null,
  }), /expected hips\|waist/);
});
