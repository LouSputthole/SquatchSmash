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

test('every binding a carried module imports is carried or stubbed', () => {
  /* The build succeeding says nothing about the build RUNNING.
   *
   * `stripImports` deletes import lines and defines nothing in their place, so
   * a binding a carried module imports and the bundle does not provide is an
   * undeclared global — fine at concatenation time, fatal the moment the code
   * runs. src/core/pause-menu.js gained an import of `installSystemicPolish`
   * and the single-file build died on it with the bundler still reporting
   * "wrote squatchsmash.html". Nothing noticed, because the test above only
   * asked whether the file appeared.
   *
   * The bundler carries two modules out of src/core/ and stubs what those
   * modules ask for and cannot have. This holds both halves honest: an import
   * added to either carried module must be answered, by a moduleIIFE that
   * provides the name or by a stub the bundler declares.
   */
  const bundler = fs.readFileSync(path.join(GAME, 'tools', 'bundle.mjs'), 'utf8');
  const carried = [...bundler.matchAll(/moduleIIFE\('([^']+)'/g)]
    .map((m) => path.resolve(GAME, m[1]))
    .filter((file) => !file.startsWith(GAME));

  /* Names the bundle defines for itself: every moduleIIFE return list, plus
   * any bare `const`/`function` the bundler emits in its own template strings
   * (the stub block). Loose on purpose — a false "provided" here can only be
   * caused by a name that really is written into the bundle. */
  const provided = new Set();
  for (const m of bundler.matchAll(/moduleIIFE\('[^']+',\s*\[([^\]]*)\]/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().replace(/^['"]|['"]$/g, '');
      if (name) provided.add(name);
    }
  }
  for (const m of bundler.matchAll(/moduleIIFE\('[^']+',[\s\S]*?,\s*'([^']+)'\)/g)) {
    for (const name of m[1].replace(/[{}]/g, '').split(',')) {
      if (name.trim()) provided.add(name.trim());
    }
  }
  for (const m of bundler.matchAll(/\b(?:const|function|let|var)\s+([\w$]+)/g)) provided.add(m[1]);
  for (const m of bundler.matchAll(/\bconst\s*\{([^}]*)\}/g)) {
    for (const name of m[1].split(',')) {
      const bound = name.trim().split(':').pop().trim();
      if (bound) provided.add(bound);
    }
  }

  const missing = [];
  for (const file of carried) {
    const body = fs.readFileSync(file, 'utf8');
    const rel = path.relative(ROOT, file);
    for (const line of body.split('\n')) {
      const named = line.match(/^\s*import\s*\{([^}]*)\}\s*from\s*['"](\.[^'"]+)['"]/);
      const star = line.match(/^\s*import\s*\*\s*as\s+([\w$]+)\s*from\s*['"](\.[^'"]+)['"]/);
      if (star && !provided.has(star[1])) missing.push(`${rel}: ${star[1]}`);
      if (!named) continue;
      for (const part of named[1].split(',')) {
        const bound = part.trim().split(/\s+as\s+/).pop().trim();
        if (bound && !provided.has(bound)) missing.push(`${rel}: ${bound}`);
      }
    }
  }
  assert.deepEqual(missing, [],
    'these bindings are imported by a module the arcade bundle carries and are '
    + 'defined nowhere in the bundle; carry them with a moduleIIFE or stub them '
    + 'in game/tools/bundle.mjs beside the pause-menu entry');
});

test('the in-world game bundles into one file', () => {
  /* The real thing, because the check above cannot see every way a module can
   * be un-bundleable. It writes game/dist/, which is a build artefact. */
  const out = execFileSync(process.execPath, ['tools/bundle.mjs'], {
    cwd: GAME, encoding: 'utf8', timeout: 120000,
  });
  assert.match(out, /wrote .*squatchsmash\.html/, out);
});
