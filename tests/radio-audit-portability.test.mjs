import assert from 'node:assert/strict';
import test from 'node:test';

import { toCsv } from '../tools/radio-audit.mjs';

test('radio audit CSVs use the repository LF contract on every platform', () => {
  const csv = toCsv(['Cue ID', 'Line'], [{ 'Cue ID': 'radio.test', Line: 'Hello, world.' }]);

  assert.equal(csv, '"Cue ID","Line"\n"radio.test","Hello, world."\n');
  assert.doesNotMatch(csv, /\r/, 'generated audit CSVs must not drift against eol=lf on Linux');
});
