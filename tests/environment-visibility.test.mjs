import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  ENVIRONMENT_VISIBILITY,
  validateEnvironmentVisibility,
} from '../src/core/environment-visibility.js';

test('all authored visibility archetypes keep supporting terrain ahead of visible content', () => {
  for (const kind of Object.keys(ENVIRONMENT_VISIBILITY)) {
    assert.deepEqual(validateEnvironmentVisibility(kind), [], `${kind} visibility policy is unsafe`);
  }
});

test('the three scenes that exposed draw-distance bugs consume shared baselines', () => {
  for (const relative of [
    '../src/luxury-apartment/main.js',
    '../src/cabin/main.js',
    '../src/cabin/world.js',
    '../src/specialmeeting/main.js',
    '../src/specialmeeting/forest/terrain.js',
  ]) {
    const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
    assert.match(source, /core\/environment-visibility\.js/);
  }
});

test('forest-drive validation rejects terrain that ends inside readable fog', () => {
  const unsafe = { ...ENVIRONMENT_VISIBILITY.forestDrive, terrainChunkRadius: 0 };
  assert.match(validateEnvironmentVisibility('forestDrive', unsafe).join('\n'), /streamed terrain/);
});
