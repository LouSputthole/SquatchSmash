import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Squatchfather room panic gives every visible physical reaction a cue', async () => {
  const source = await readFile(new URL('../src/squatchfather/main.js', import.meta.url), 'utf8');
  const start = source.indexOf('function updateCowering(dt)');
  const end = source.indexOf('// ---------------------------------------------------------------- states', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const panic = source.slice(start, end);

  assert.match(panic, /waiterPanicStepClock -= dt;[\s\S]*Foley\.footstep\('wood', 0\.82\)/);
  assert.match(panic, /for \(const \[fig, out\][\s\S]*Foley\.chairScrape\(\);[\s\S]*fig\.startCower\(\)/);
  assert.match(panic, /waiterPanic = 'run';[\s\S]*Foley\.doorOpen\(\);[\s\S]*kitchenDoor\.rotation\.y/);
  assert.match(panic, /function resetRoomReactions\(\)[\s\S]*waiterPanicStepClock = 0;/);
});
