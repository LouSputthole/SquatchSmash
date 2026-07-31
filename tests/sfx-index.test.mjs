/**
 * index.json is the list the game fetches from. A recording that is not in it
 * is a recording nobody hears, and because every cue has a procedural
 * fallback, that failure is silent: the game plays the stand-in and no error
 * appears anywhere. This is the check that a delivered file gets in.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { writeIndex } from '../tools/sfx-index-json.mjs';

const KB = Buffer.alloc(2048, 7);

test('a dropped recording is indexed; placeholders and strays are not', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sfx-index-'));
  try {
    await fs.writeFile(path.join(dir, 'poop.strain.mp3'), KB);      // delivered
    await fs.writeFile(path.join(dir, 'glue.pickup.wav'), KB);      // delivered, other format
    await fs.writeFile(path.join(dir, 'truncated.mp3'), Buffer.alloc(64));
    await fs.writeFile(path.join(dir, '_listen.html'), KB);
    await fs.writeFile(path.join(dir, 'manifest.json'), KB);

    const files = await writeIndex(dir);
    assert.deepEqual(files, ['glue.pickup.wav', 'poop.strain.mp3']);

    // ...and it is on disk in the shape the game reads, not just returned.
    const onDisk = JSON.parse(await fs.readFile(path.join(dir, 'index.json'), 'utf8'));
    assert.deepEqual(onDisk.files, files);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
