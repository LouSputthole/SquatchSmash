import assert from 'node:assert/strict';
import test from 'node:test';

import { chooseNoImmediateRepeat } from '../src/core/audio-variant-bank.js';

test('audio variant banks never immediately repeat when another take is available', () => {
  const cues = ['take.1', 'take.2', 'take.3', 'take.4'];

  assert.equal(chooseNoImmediateRepeat(cues, 'take.1', () => 0), 'take.2');
  assert.equal(chooseNoImmediateRepeat(cues, 'take.4', () => 0.999), 'take.3');
  assert.equal(chooseNoImmediateRepeat(['only'], 'only', () => 0), 'only');
  assert.equal(chooseNoImmediateRepeat([], null, () => 0), null);
});
