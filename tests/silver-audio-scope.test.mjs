import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { AudioEngine } from '../src/core/audio.js';

const dataFile = 'data:audio/mpeg;base64,ZmFrZQ==';

test('loadManifest filter widens a prefix selection to the shared effects pool', async () => {
  globalThis.__SQUATCH_INLINE = {
    'assets/sfx/manifest.json': {
      sfx: [
        { name: 'vo.silver.host.welcome.1', file: dataFile },
        { name: 'vo.nowake.dock.willy.nice-night.1', file: dataFile },
        { name: 'kitchen.pan', file: dataFile },
        { name: 'crowd.laughter', file: dataFile },
      ],
    },
  };
  try {
    const audio = new AudioEngine();
    let wanted = [];
    audio._loadWanted = async (cues) => {
      wanted = cues;
      audio.loadedCount = cues.length;
    };
    await audio.loadManifest({
      prefixes: ['vo.silver.'],
      filter: (cue) => !cue.name.startsWith('vo.'),
    });
    assert.deepEqual(
      wanted.map((cue) => cue.name).sort(),
      ['crowd.laughter', 'kitchen.pan', 'vo.silver.host.welcome.1'],
      'own dialogue and un-prefixed effects load; other scenes\' dialogue must not',
    );
  } finally {
    delete globalThis.__SQUATCH_INLINE;
  }
});

test('the Silver Room start no longer decodes the whole bank', () => {
  /* The unscoped call decoded all ~3,700 cues — every scene's dialogue —
   * before game.started could flip (the first-click hang, and the
   * verify-silver-story timeout). The page must stay scoped. */
  const main = fs.readFileSync(new URL('../src/silver/main.js', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /await audio\.loadManifest\(\)/,
    'src/silver/main.js must not call loadManifest unscoped');
  assert.match(main, /prefixes: \['vo\.silver\.'\]/);
});
