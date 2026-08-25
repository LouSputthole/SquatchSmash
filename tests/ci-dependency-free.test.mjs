/**
 * `npm test` MUST RUN WITH NOTHING INSTALLED.
 *
 * The Pages workflow runs `npm test` and never runs `npm ci`. That is
 * deliberate and it is the same decision as the vendored three.js: the game
 * is plain ES modules, the suite is plain `node:test`, and neither needs a
 * package tree. The devDependencies (`playwright`, `eslint`) exist for the
 * BROWSER gates -- `tools/verify-*.mjs`, run by hand and on a machine that
 * has them -- not for the suite.
 *
 * On 2026-08-24 that contract was broken by one static import. The scene
 * certification pass added two test modules that read
 * `tools/launch-chromium.mjs` for its case tables without ever launching a
 * browser; that module imported `playwright` at the top level, and a static
 * import is resolved before a single line of either test runs. Both failed
 * with ERR_MODULE_NOT_FOUND, `npm test` exited 1, and THREE consecutive Pages
 * deploys stopped before the staging step -- so the published site went on
 * serving the build from before the countryside cabin and the luxury
 * apartment existed, while main was green on a developer machine where
 * playwright happens to be installed.
 *
 * Nothing in the suite caught it, because every developer machine has the
 * package. This walks the STATIC import graph from `tests/run.mjs` and
 * refuses any edge into a dependency the deploy will not have. `await
 * import('playwright')` inside a function is fine and is what the browser
 * gates do -- it costs nothing until something actually launches a browser.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ROOT = new URL('../', import.meta.url).pathname;

/** Everything package.json admits it does not install for the deploy. */
const OPTIONAL_PACKAGES = Object.freeze(
  Object.keys(JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')).devDependencies ?? {}),
);

/* Static `import ... from '<x>'` and `export ... from '<x>'` only. A dynamic
 * `await import()` is deliberately NOT matched: deferring is the fix. */
const STATIC_FROM = /(?:^|\n)\s*(?:import|export)[\s\S]{0,400}?\sfrom\s*['"]([^'"]+)['"]/g;
const BARE_IMPORT = /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;

function specifiersIn(source) {
  const found = [];
  for (const pattern of [STATIC_FROM, BARE_IMPORT]) {
    pattern.lastIndex = 0;
    let match = pattern.exec(source);
    while (match) {
      found.push(match[1]);
      match = pattern.exec(source);
    }
  }
  return found;
}

/**
 * Walk the static graph from a set of entry files, following relative edges.
 *
 * The entries are every `tests/*.test.mjs`, not `tests/run.mjs`: run.mjs holds
 * its list as STRINGS and imports them dynamically, so a walk that started
 * there would reach two files and pass vacuously. What matters is the same
 * set either way -- every module `npm test` loads.
 */
function staticGraph(entries) {
  const seen = new Set();
  const offenders = [];
  const queue = entries.map((entry) => resolve(ROOT, entry));
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    for (const specifier of specifiersIn(source)) {
      if (specifier.startsWith('.')) {
        queue.push(resolve(dirname(file), specifier));
        continue;
      }
      if (OPTIONAL_PACKAGES.includes(specifier.split('/')[0])) {
        offenders.push(`${file.slice(ROOT.length)} statically imports '${specifier}'`);
      }
    }
  }
  return { seen, offenders };
}

test('nothing npm test imports needs a package the Pages deploy will not install', () => {
  const tests = readdirSync(resolve(ROOT, 'tests'))
    .filter((name) => name.endsWith('.test.mjs'))
    .map((name) => `tests/${name}`);
  assert.ok(tests.length > 100, `only ${tests.length} test files found`);
  const { seen, offenders } = staticGraph(['tests/run.mjs', ...tests]);
  /* A graph that collapsed to almost nothing would pass this vacuously. */
  assert.ok(seen.size > 200, `the import walk only reached ${seen.size} files`);
  assert.deepEqual(offenders, [], [
    'These are resolved before any test body runs, so they fail the whole suite',
    'on a runner with no node_modules -- and the Pages deploy is exactly that.',
    'Defer them: `const { chromium } = await import(\'playwright\')` inside the',
    'function that launches, the way tools/launch-chromium.mjs does now.',
    ...offenders,
  ].join('\n  '));
});

test('the deploy still installs nothing, so the contract above is the real one', () => {
  const workflow = readFileSync(resolve(ROOT, '.github/workflows/pages.yml'), 'utf8');
  assert.match(workflow, /npm test/, 'the deploy no longer runs the suite');
  assert.doesNotMatch(workflow, /npm (ci|install)\b/,
    'the deploy installs packages now — if that is deliberate, this whole file can go');
  assert.ok(OPTIONAL_PACKAGES.includes('playwright'),
    'playwright left devDependencies; check what the browser gates run on');
});
