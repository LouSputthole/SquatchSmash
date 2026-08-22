/**
 * SQUATCH SMASH STILL BUNDLES.
 *
 * `game/` is not a legacy tree. It is the PC game the campaign opens inside,
 * and it does not merely run from source: `game/tools/bundle.mjs` flattens it
 * into one self-contained HTML file by concatenating its modules and STRIPPING
 * THE IMPORT LINES. Anything in `game/src/` that reaches outside `game/`, or
 * that uses a form the stripper does not recognise, breaks that build.
 *
 * WHY THIS TEST EXISTS. A pass of mine read `lambert` as shared code stranded
 * in a legacy tree and moved it to `src/world/build.js`, leaving a re-export
 * behind. Both halves were wrong -- `game/` has eighty-six lambert call sites
 * of its own -- and the re-export was not an import statement, so it survived
 * the strip and the bundler refused to build. The whole suite stayed green,
 * check and eslint stayed green, and the in-world game was broken, because
 * nothing ran the bundler.
 *
 * The dependency runs ONE WAY: src/ scenes may borrow from game/, and game/
 * borrows nothing back.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GAME = path.join(ROOT, 'game');

test('game/src reaches outside game/ only where the bundler knows to follow', () => {
  /* NOT a blanket ban. The bundle deliberately carries two shared modules --
   * `src/core/settings.js` and `src/core/pause-menu.js` -- so the in-world
   * game honours the player's keymap and pause menu instead of shipping its
   * own. The bundler names them in its own module list, and that list is the
   * authority: an outward import it has not been told about is one it will
   * not flatten, and the build fails with "bundle still contains
   * import/export statements" naming no file at all. This names the file. */
  const bundler = fs.readFileSync(path.join(GAME, 'tools', 'bundle.mjs'), 'utf8');
  const known = new Set(
    [...bundler.matchAll(/moduleIIFE\('([^']+)'/g)]
      /* The bundler's own paths are relative to game/, not to game/tools:
       * its entries read 'src/audio.js' for game's modules and
       * '../src/core/pause-menu.js' for the two shared ones. */
      .map((m) => path.resolve(GAME, m[1])),
  );

  const dir = path.join(GAME, 'src');
  const offenders = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.js')) continue;
    const body = fs.readFileSync(path.join(dir, name), 'utf8');
    for (const line of body.split('\n')) {
      const m = line.match(/^\s*(?:import|export)\b[^\n]*from\s*['"]([^'"]+)['"]/);
      if (!m) continue;
      /* Bare specifiers are the import map's ('three'). */
      if (!m[1].startsWith('.')) continue;
      const resolved = path.resolve(dir, m[1]);
      if (resolved.startsWith(GAME) || known.has(resolved)) continue;
      offenders.push(`game/src/${name}: ${line.trim()}`);
    }
  }
  assert.deepEqual(offenders, [],
    'game/ borrows from src/ only through modules its bundler carries; these do not');
});

test('the in-world game bundles into one file', () => {
  /* The real thing, because the check above cannot see every way a module can
   * be un-bundleable. It writes game/dist/, which is a build artefact. */
  const out = execFileSync(process.execPath, ['tools/bundle.mjs'], {
    cwd: GAME, encoding: 'utf8', timeout: 120000,
  });
  assert.match(out, /wrote .*squatchsmash\.html/, out);
});
