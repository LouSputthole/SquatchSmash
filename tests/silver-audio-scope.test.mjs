import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { AudioEngine } from '../src/core/audio.js';
import {
  SilverAudioEngine, SILVER_START_EFFECTS, SILVER_START_VOICE_PREFIXES,
} from '../src/silver/audio.js';

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

test('Silver audio opens on the curbside slice and defers the interior bank', async () => {
  const cues = [
    { name: 'vo.silver.driver.open', file: dataFile },
    { name: 'vo.silver.margo.arrival.open', file: dataFile },
    { name: 'vo.silver.waiter.open', file: dataFile },
    { name: 'ambience.city.night', file: dataFile },
    { name: 'kitchen.sizzle', file: dataFile },
    { name: 'band.horns', file: dataFile },
    { name: 'vo.nowake.willy.open', file: dataFile },
  ];
  globalThis.__SQUATCH_INLINE = { 'assets/sfx/manifest.json': { sfx: cues } };
  try {
    const audio = new SilverAudioEngine();
    const loads = [];
    audio._loadWanted = async (wanted, concurrency) => {
      loads.push({ names: wanted.map((cue) => cue.name), concurrency });
      audio.loadedCount += wanted.length;
    };

    await audio.loadManifest();
    assert.deepEqual(loads[0], {
      names: ['vo.silver.driver.open', 'vo.silver.margo.arrival.open', 'ambience.city.night'],
      concurrency: 8,
    });
    assert.equal(audio.preloadStats.selected, 3);
    assert.equal(audio.preloadStats.scoped, 6);
    assert.equal(audio.preloadStats.deferred, 3);
    assert.equal(SILVER_START_EFFECTS.has('kitchen.sizzle'), false);
    assert.equal(SILVER_START_VOICE_PREFIXES.some((p) => 'vo.silver.waiter.open'.startsWith(p)), false);

    await audio.loadDeferredVo();
    assert.deepEqual(loads[1], {
      names: ['vo.silver.waiter.open', 'kitchen.sizzle', 'band.horns'],
      concurrency: 8,
    });
    assert.equal(audio.deferredReady, true);
  } finally {
    delete globalThis.__SQUATCH_INLINE;
  }
});
