/**
 * NEW SCENES USE THE SYSTEMS WE ALREADY HAVE.
 *
 * Owner: *"We keep reinventing and using different systems instead of using
 * what we already have... We're starting to see the cost of duplicating these
 * systems now: initiation has different movement, new dialogue has different
 * volume/timing, objectives change presentation, decals behave differently."*
 *
 * docs/REUSE-FIRST.md has said so for a fortnight and has never once stopped
 * it, because a doc cannot fail a build. This can. It holds
 * tools/shared-systems.mjs to the actual source tree, so adoption can go up
 * freely and can only go down on purpose, in a diff somebody has to read.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  NON_SCENE_DIRECTORIES,
  SCENE_SYSTEM_ADOPTION,
  SHARED_SYSTEMS,
} from '../tools/shared-systems.mjs';

const SRC = new URL('../src/', import.meta.url).pathname;

function sourceFiles(directory) {
  const found = [];
  const walk = (path) => {
    for (const item of readdirSync(path, { withFileTypes: true })) {
      const next = join(path, item.name);
      if (item.isDirectory()) walk(next);
      else if (item.name.endsWith('.js')) found.push(next);
    }
  };
  walk(directory);
  return found;
}

const sceneDirectories = readdirSync(SRC, { withFileTypes: true })
  .filter((item) => item.isDirectory() && !NON_SCENE_DIRECTORIES.includes(item.name))
  .map((item) => item.name)
  .sort();

/** Files under one scene that import a given shared module, by its filename. */
function importers(scene, modulePath) {
  const specifier = modulePath.replace(/^src\//, '').replace(/\.js$/, '');
  const patterns = [new RegExp(`from\\s+['"][^'"]*${specifier.replace('/', '\\/')}\\.js['"]`)];
  /* A SHARED SYSTEM THAT LIVES INSIDE A SCENE DIRECTORY IMPORTS ITSELF
   * RELATIVELY, and the path form above cannot see that.
   *
   * `src/golf/swing.js` is the meter every power bar in the game now uses,
   * and golf reaches it as `from './swing.js'` while the mansion reaches it
   * as `from '../golf/swing.js'`. Without this the record would say golf does
   * not use the golf swing, which is a lie of exactly the kind this file
   * exists to stop -- a table that reads as "the home of the system opted
   * out" is worse than no table. Only the OWNING scene gets the relative
   * form, so nothing else can be counted by accident. */
  const owner = specifier.includes('/') ? specifier.slice(0, specifier.indexOf('/')) : null;
  if (owner === scene) {
    const local = specifier.slice(specifier.lastIndexOf('/') + 1);
    patterns.push(new RegExp(`from\\s+['"]\\.[^'"]*${local}\\.js['"]`));
  }
  return sourceFiles(join(SRC, scene))
    .filter((file) => {
      const text = readFileSync(file, 'utf8');
      return patterns.some((pattern) => pattern.test(text));
    });
}

test('every scene directory has a row: a new scene declares what it reuses', () => {
  assert.deepEqual(sceneDirectories, Object.keys(SCENE_SYSTEM_ADOPTION).sort());
});

test('every row covers every shared system', () => {
  const ids = SHARED_SYSTEMS.map(({ id }) => id).sort();
  for (const [scene, row] of Object.entries(SCENE_SYSTEM_ADOPTION)) {
    const covered = Object.keys(row).filter((key) => key !== 'notes').sort();
    assert.deepEqual(covered, ids, `${scene} is missing a shared-system column`);
  }
});

test('the recorded adoption is the real adoption', () => {
  const drift = [];
  for (const [scene, row] of Object.entries(SCENE_SYSTEM_ADOPTION)) {
    for (const system of SHARED_SYSTEMS) {
      const actual = importers(scene, system.module).length;
      if (actual !== row[system.id]) {
        drift.push(`${scene}.${system.id}: recorded ${row[system.id]}, source has ${actual}`);
      }
    }
  }
  assert.deepEqual(drift, [], [
    'Shared-system adoption drifted from tools/shared-systems.mjs.',
    'Going UP is the point — update the record and keep the win.',
    'Going DOWN means a scene stopped using something shared; say why in `notes`.',
    ...drift,
  ].join('\n  '));
});

test('a scene that opts out of everything explains itself', () => {
  for (const [scene, row] of Object.entries(SCENE_SYSTEM_ADOPTION)) {
    const total = SHARED_SYSTEMS.reduce((sum, { id }) => sum + row[id], 0);
    if (total === 0) {
      assert.ok(
        typeof row.notes === 'string' && row.notes.trim().length > 20,
        `${scene} imports no shared system at all and does not say why`,
      );
    }
  }
});

test('the shared systems are real modules, described', () => {
  for (const system of SHARED_SYSTEMS) {
    assert.ok(readFileSync(new URL(`../${system.module}`, import.meta.url), 'utf8').length > 0);
    assert.ok(system.what.length > 20, `${system.id} needs a one-line reason it is shared`);
  }
});
